"""Offline context projection. No retrieval, assessment, or runtime integration."""

from copy import deepcopy
import re
import unicodedata


SOURCES = frozenset({"skill", "project", "experience", "education", "certification", "profile"})
CONTEXT_SOURCES = SOURCES - {"skill", "profile"}


def _norm(text):
    return " ".join(unicodedata.normalize("NFKC", text).casefold().split())


def _integer(value, name, upper):
    if type(value) is not int or not 0 <= value <= upper:
        raise ValueError(f"{name} must be an integer in [0, {upper}]")


def augment_context(result, evidence_inventory, max_companions=2, *,
                    max_chars_per_query=2000, max_total_chars=20000):
    """Wrap current M1 output without modifying it.

    Inventory is the COMPLETE canonical {id: {id, text, source}} for the SAME
    candidate used by M1. M1 carries no candidate ID: caller provenance is
    required, and cannot be inferred from reused IDs alone. Validate all inputs
    before projecting anything. Quotes always come from inventory, never from
    normalized comparisons. Limits omit entire passages, never clip them.
    """
    _integer(max_companions, "max_companions", 2)
    _integer(max_chars_per_query, "max_chars_per_query", 5000)
    _integer(max_total_chars, "max_total_chars", 128000)
    if not isinstance(evidence_inventory, dict) or len(evidence_inventory) > 256:
        raise ValueError("Complete canonical inventory must be a mapping of at most 256 items")
    inventory = {}
    for key, row in evidence_inventory.items():
        if (not isinstance(key, str) or not key or len(key) > 512 or not isinstance(row, dict)
                or row.get("id") != key or not isinstance(row.get("source"), str)
                or row["source"] not in SOURCES
                or not isinstance(row.get("text"), str) or not _norm(row["text"])
                or len(row["text"]) > 5000):
            raise ValueError("Invalid canonical inventory ID/source/text or input bound")
        inventory[key] = dict(row)
    parents = {}
    for key, row in inventory.items():
        match = re.fullmatch(r"(.+)/technologies/(0|[1-9][0-9]*)", key)
        if match and row["source"] == "project":
            parent = match[1]
            if parent not in inventory or inventory[parent]["source"] != "project":
                raise ValueError("Unknown or mismatched project parent ID")
            if not _literal(row["text"], inventory[parent]["text"]):
                raise ValueError("Technology text is absent from canonical parent")
            parents[key] = parent
    if not isinstance(result, dict) or not isinstance(result.get("requirements"), (list, tuple)):
        raise ValueError("Current M1 requirements are required")
    if len(result["requirements"]) > 64:
        raise ValueError("At most 64 queries")
    query_ids = set()
    for query in result["requirements"]:
        if not isinstance(query, dict) or not isinstance(query.get("requirement"), dict):
            raise ValueError("Invalid M1 query")
        requirement = query["requirement"]
        qid = requirement.get("id")
        if (not isinstance(qid, str) or not qid or qid in query_ids
                or not isinstance(requirement.get("text"), str)
                or not _norm(requirement["text"]) or len(requirement["text"]) > 5000):
            raise ValueError("Invalid or duplicate query ID/text")
        query_ids.add(qid)
        hits, ranked = query.get("hits"), query.get("ranked_evidence_ids")
        if (not isinstance(hits, (list, tuple)) or len(hits) > 3
                or not isinstance(ranked, (list, tuple))
                or any(not isinstance(key, str) for key in ranked)
                or len(ranked) != len(set(ranked)) or set(ranked) != set(inventory)):
            raise ValueError("M1 ranks must bind the complete same-candidate inventory")
        hit_ids = []
        for hit in hits:
            if not isinstance(hit, dict) or not isinstance(hit.get("id"), str):
                raise ValueError("Invalid M1 hit")
            row = inventory.get(hit["id"])
            if (row is None or hit.get("source") != row["source"]
                    or not isinstance(hit.get("text"), str)
                    or hit["text"] != row["text"]):
                raise ValueError("Unknown hit ID or source/text mismatch")
            hit_ids.append(hit["id"])
        if hit_ids != list(ranked[:len(hits)]):
            raise ValueError("M1 hit/rank IDs disagree")

    used_quotes, total_chars, projections = {}, 0, []
    for query in result["requirements"]:
        hits = query["hits"]
        visible = {_norm(inventory[h["id"]]["text"]) for h in hits}
        eligible = {}
        unresolved_hits = []
        skipped_links = []
        for hit in hits:
            row = inventory[hit["id"]]
            anchor_in_query = _literal(row["text"], query["requirement"]["text"])
            targets = []
            if row["id"] in parents:
                targets = [(parents[row["id"]], "EXPLICIT_PROJECT_PARENT_ID", True)]
            elif row["source"] == "skill" and len(_norm(row["text"])) <= 60 and len(_norm(row["text"]).split()) <= 3:
                if anchor_in_query:
                    targets = [(key, "CROSS_RECORD_LITERAL_MENTION", False)
                               for key, target in sorted(inventory.items())
                               if target["source"] in CONTEXT_SOURCES
                               and len(_norm(target["text"])) > len(_norm(row["text"]))
                               and _literal(row["text"], target["text"])]
                else:
                    skipped_links.append({"hit_id": row["id"],
                        "reason": "CROSS_RECORD_ANCHOR_NOT_LITERAL_IN_REQUIREMENT"})
            if not targets:
                unresolved_hits.append(row["id"])
            for key, reason, same_record in targets:
                entry = eligible.setdefault(key, {"id": key, "context_id": "context:" + key,
                    "source": inventory[key]["source"],
                    "text": inventory[key]["text"], "tag": "ORIGINAL_SOURCE_CONTEXT",
                    "links": [], "ambiguous": False, "unresolved": True,
                    "same_activity_verified": False})
                entry["links"].append({"hit_id": row["id"], "reason": reason,
                                       "same_record_only": same_record,
                                       "anchor_literal_in_requirement": anchor_in_query,
                                       "query_relation_unverified": True,
                                       "same_activity_verified": False})
                entry["ambiguous"] |= len(targets) > 1
        companions, shared_refs, chars = [], [], 0
        omitted = {"already_visible": 0, "global_duplicate": 0, "count_budget": 0,
                   "query_char_budget": 0, "global_char_budget": 0}
        # Reuse the frozen M1 ordering; do not reorder or replace baseline hits.
        rank = {key: index for index, key in enumerate(query["ranked_evidence_ids"])}
        for key in sorted(eligible, key=rank.__getitem__):
            entry = eligible[key]
            quote, size = _norm(entry["text"]), len(entry["text"])
            if quote in visible:
                omitted["already_visible"] += 1
            elif quote in used_quotes:
                omitted["global_duplicate"] += 1
                shared_refs.append({**used_quotes[quote], "requested_context_id": entry["context_id"],
                                    "links": entry["links"]})
            elif len(companions) >= max_companions:
                omitted["count_budget"] += 1
            elif chars + size > max_chars_per_query:
                omitted["query_char_budget"] += 1
            elif total_chars + size > max_total_chars:
                omitted["global_char_budget"] += 1
            else:
                companions.append(entry)
                used_quotes[quote] = {"requirement_id": query["requirement"]["id"],
                                      "context_id": entry["context_id"]}
                chars += size
                total_chars += size
        reasons = []
        if not eligible:
            reasons.append("NO_ELIGIBLE_STRUCTURAL_OR_LITERAL_CONTEXT")
        reasons.extend(name.upper() for name, count in omitted.items() if count)
        projections.append({"requirement_id": query["requirement"]["id"],
            "context_state": "CONTEXT_AVAILABLE" if companions or shared_refs else "NO_ADDITIONAL_CONTEXT",
            "companions": companions, "shared_context_refs": shared_refs, "reason_codes": reasons,
            "skipped_links": skipped_links,
            "unresolved": True, "unresolved_hit_ids": unresolved_hits,
            "ambiguous": any(e["ambiguous"] for e in eligible.values()),
            "absence_is_not_absent_proof": True, "eligible_count": len(eligible),
            "omitted_count": sum(omitted.values()), "omitted_by_reason": omitted,
            "chars_used": chars})
    return {"baseline": deepcopy(result), "context_companion": {
        "schema": "context-companion-v1", "scope": "OFFLINE_CONTEXT_ONLY",
        "requirements": projections, "chars_used": total_chars,
        "budget": {"max_companions": max_companions,
                   "max_chars_per_query": max_chars_per_query, "max_total_chars": max_total_chars}}}


def _literal(anchor, passage):
    # Unicode-aware boundaries protect SQL/NoSQL, Java/JavaScript, C/C++.
    # Normalize only for comparison; retain the complete original source quote.
    return bool(re.search(r"(?<![\w+#])" + re.escape(_norm(anchor)) + r"(?![\w+#])",
                          _norm(passage)))
