"""Normalize explicit nullable job-service text fields at the receiving boundary."""


NULLABLE_JOB_TEXT = ("description", "requirements", "workingType", "experienceLevel", "location")


def normalize_job_snapshot(value):
    if not isinstance(value, dict):
        return value
    result = dict(value)
    for name in NULLABLE_JOB_TEXT:
        if name in result and result[name] is None:
            result[name] = ""
    return result
