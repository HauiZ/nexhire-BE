# NexHire BE Updated Diagrams & Architecture Description

This document contains Draw.io XML system architecture diagrams, event communication flows, and the system ERD updated to align with the codebase structure, alongside detailed descriptions of the components and message patterns.

---

## 1. System Overview Architecture Diagram (Draw.io XML)

You can copy the XML code block below and import it directly into [draw.io (app.diagrams.net)](https://app.diagrams.net/) by going to **File > Import from > Text...** or **Device** to view and edit the visual diagram.

```xml
<mxfile host="app.diagrams.net" modified="2026-08-06T00:00:00.000Z" agent="Codex" version="24.7.17" type="device">
  <diagram id="nexhire-updated-system-diagram" name="NexHire Updated Architecture">
    <mxGraphModel dx="1800" dy="1100" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1600" pageHeight="1200" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />

        <!-- Title -->
        <mxCell id="title" value="NexHire BE Updated Architecture Diagram" style="text;html=1;strokeColor=none;fillColor=none;fontSize=24;fontStyle=1;fontColor=#1E293B;align=center;verticalAlign=middle;" vertex="1" parent="1">
          <mxGeometry x="350" y="30" width="900" height="50" as="geometry" />
        </mxCell>

        <!-- Container: Client Apps -->
        <mxCell id="cClientApps" value="Client Apps" style="swimlane;html=1;startSize=30;rounded=1;arcSize=10;strokeColor=#94A3B8;fillColor=#F8FAFC;fontColor=#1E293B;fontStyle=1;" vertex="1" parent="1">
          <mxGeometry x="50" y="160" width="220" height="320" as="geometry" />
        </mxCell>
        <mxCell id="clientUser" value="Candidate / Recruiter App&lt;br&gt;(Web / Mobile)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EFF6FF;strokeColor=#3B82F6;fontColor=#1E3A8A;fontStyle=1;" vertex="1" parent="cClientApps">
          <mxGeometry x="20" y="60" width="180" height="70" as="geometry" />
        </mxCell>
        <mxCell id="clientAdmin" value="Web Admin Dashboard&lt;br&gt;(CMS / Backoffice)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#F0FDF4;strokeColor=#16A34A;fontColor=#14532D;fontStyle=1;" vertex="1" parent="cClientApps">
          <mxGeometry x="20" y="180" width="180" height="70" as="geometry" />
        </mxCell>

        <!-- Container: API Gateway -->
        <mxCell id="cGateway" value="API Gateway" style="swimlane;html=1;startSize=30;rounded=1;arcSize=10;strokeColor=#94A3B8;fillColor=#F8FAFC;fontColor=#1E293B;fontStyle=1;" vertex="1" parent="1">
          <mxGeometry x="360" y="160" width="240" height="320" as="geometry" />
        </mxCell>
        <mxCell id="gatewayCore" value="Reverse Proxy / Router&lt;br&gt;(gateway/proxy)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#F5F5F7;strokeColor=#707072;fontColor=#1C1C1E;fontStyle=1;" vertex="1" parent="cGateway">
          <mxGeometry x="30" y="60" width="180" height="70" as="geometry" />
        </mxCell>
        <mxCell id="adminApi" value="Admin API Module&lt;br&gt;(gateway/admin-dashboard)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#FFFBEB;strokeColor=#D97706;fontColor=#78350F;fontStyle=1;" vertex="1" parent="cGateway">
          <mxGeometry x="30" y="180" width="180" height="70" as="geometry" />
        </mxCell>

        <!-- Component: IDP / Auth Service -->
        <mxCell id="authService" value="IDP Service&lt;br&gt;(auth-service)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EEF2F6;strokeColor=#475569;fontColor=#0F172A;fontStyle=1;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="710" y="160" width="200" height="80" as="geometry" />
        </mxCell>

        <!-- Container: Microservices -->
        <mxCell id="cMicroservices" value="Microservices" style="swimlane;html=1;startSize=30;rounded=1;arcSize=10;strokeColor=#94A3B8;fillColor=#F8FAFC;fontColor=#1E293B;fontStyle=1;" vertex="1" parent="1">
          <mxGeometry x="710" y="280" width="460" height="420" as="geometry" />
        </mxCell>
        <mxCell id="srvJob" value="Job Service" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#F1F5F9;strokeColor=#64748B;fontColor=#0F172A;" vertex="1" parent="cMicroservices">
          <mxGeometry x="30" y="60" width="180" height="50" as="geometry" />
        </mxCell>
        <mxCell id="srvCandidate" value="Candidate Service" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#F1F5F9;strokeColor=#64748B;fontColor=#0F172A;" vertex="1" parent="cMicroservices">
          <mxGeometry x="250" y="60" width="180" height="50" as="geometry" />
        </mxCell>
        <mxCell id="srvCompany" value="Company Service" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#F1F5F9;strokeColor=#64748B;fontColor=#0F172A;" vertex="1" parent="cMicroservices">
          <mxGeometry x="30" y="150" width="180" height="50" as="geometry" />
        </mxCell>
        <mxCell id="srvApplication" value="Application Service" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#F1F5F9;strokeColor=#64748B;fontColor=#0F172A;" vertex="1" parent="cMicroservices">
          <mxGeometry x="250" y="150" width="180" height="50" as="geometry" />
        </mxCell>
        <mxCell id="srvCvParsing" value="CV Parsing Service" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#F1F5F9;strokeColor=#64748B;fontColor=#0F172A;" vertex="1" parent="cMicroservices">
          <mxGeometry x="30" y="240" width="180" height="50" as="geometry" />
        </mxCell>
        <mxCell id="srvDocument" value="Document Storage" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#F1F5F9;strokeColor=#64748B;fontColor=#0F172A;" vertex="1" parent="cMicroservices">
          <mxGeometry x="250" y="240" width="180" height="50" as="geometry" />
        </mxCell>
        <mxCell id="srvMatching" value="Matching Service" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#F1F5F9;strokeColor=#64748B;fontColor=#0F172A;" vertex="1" parent="cMicroservices">
          <mxGeometry x="30" y="330" width="180" height="50" as="geometry" />
        </mxCell>
        <mxCell id="srvNotification" value="Notification Service" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#F1F5F9;strokeColor=#64748B;fontColor=#0F172A;" vertex="1" parent="cMicroservices">
          <mxGeometry x="250" y="330" width="180" height="50" as="geometry" />
        </mxCell>

        <!-- Event Bus / RabbitMQ -->
        <mxCell id="eventBus" value="Event Bus&lt;br&gt;(RabbitMQ)" style="shape=hexagon;perimeter=hexagonPerimeter2;whiteSpace=wrap;html=1;fixedSize=1;fillColor=#FFEFD5;strokeColor=#FF8C00;fontColor=#0F172A;fontStyle=1;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="1270" y="450" width="200" height="90" as="geometry" />
        </mxCell>

        <!-- Cache Server / Redis -->
        <mxCell id="redisCache" value="Cache Server&lt;br&gt;(Redis)" style="shape=cylinder3d;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;fillColor=#FFEBEC;strokeColor=#E11D48;fontColor=#0F172A;fontStyle=1;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="735" y="780" width="150" height="90" as="geometry" />
        </mxCell>

        <!-- Databases -->
        <mxCell id="postgresDb" value="Databases&lt;br&gt;(PostgreSQL)" style="shape=cylinder3d;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;fillColor=#F5F3FF;strokeColor=#7C3AED;fontColor=#0F172A;fontStyle=1;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="975" y="780" width="150" height="90" as="geometry" />
        </mxCell>

        <!-- External Providers -->
        <mxCell id="cExternal" value="External Providers" style="swimlane;html=1;startSize=30;rounded=1;arcSize=10;strokeColor=#94A3B8;fillColor=#FAFAFA;fontColor=#1E293B;fontStyle=1;" vertex="1" parent="1">
          <mxGeometry x="1270" y="160" width="260" height="220" as="geometry" />
        </mxCell>
        <mxCell id="extGoogle" value="Google OAuth 2.0" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EFF6FF;strokeColor=#3B82F6;fontColor=#1E3A8A;fontStyle=1;" vertex="1" parent="cExternal">
          <mxGeometry x="20" y="50" width="220" height="45" as="geometry" />
        </mxCell>
        <mxCell id="extGemini" value="Gemini API (CV Parsing)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#F0FDF4;strokeColor=#16A34A;fontColor=#14532D;fontStyle=1;" vertex="1" parent="cExternal">
          <mxGeometry x="20" y="115" width="220" height="45" as="geometry" />
        </mxCell>
        <mxCell id="extMinio" value="MinIO / S3 (Object Storage)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#FFFBEB;strokeColor=#D97706;fontColor=#78350F;fontStyle=1;" vertex="1" parent="cExternal">
          <mxGeometry x="20" y="165" width="220" height="45" as="geometry" />
        </mxCell>

        <!-- Edges: Auth Service to External Google OAuth -->
        <mxCell id="eAuthGoogle" value="OAuth2 flow" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#3B82F6;strokeWidth=1.5;endArrow=block;dashed=1;" edge="1" parent="1" source="authService" target="extGoogle">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>

        <!-- Edges: CV Parsing to Gemini -->
        <mxCell id="eCvGemini" value="Parse CV" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#16A34A;strokeWidth=1.5;endArrow=block;dashed=1;" edge="1" parent="1" source="srvCvParsing" target="extGemini">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>

        <!-- Edges: Document Storage to MinIO -->
        <mxCell id="eDocMinio" value="Upload / Presign" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#D97706;strokeWidth=1.5;endArrow=block;dashed=1;" edge="1" parent="1" source="srvDocument" target="extMinio">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
        <!-- Clients to Gateway Router -->
        <mxCell id="eUserGateway" value="API Call" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#3B82F6;strokeWidth=1.5;endArrow=block;" edge="1" parent="1" source="clientUser" target="gatewayCore">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>

        <!-- Web Admin to Admin API / Gateway Router -->
        <mxCell id="eAdminGateway" value="Admin API / Overview" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#16A34A;strokeWidth=1.5;endArrow=block;" edge="1" parent="1" source="clientAdmin" target="adminApi">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>

        <!-- Gateway Router to IDP Login -->
        <mxCell id="eGatewayLogin" value="Login / Auth" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#475569;strokeWidth=1.5;endArrow=block;exitX=1;exitY=0.25;entryX=0;entryY=0.25;" edge="1" parent="1" source="gatewayCore" target="authService">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>

        <!-- IDP return Access Token to Gateway -->
        <mxCell id="eTokenReturn" value="Return access_token" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#F59E0B;strokeWidth=1.5;endArrow=block;dashed=1;exitX=0;exitY=0.75;entryX=1;entryY=0.75;" edge="1" parent="1" source="authService" target="gatewayCore">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>

        <!-- Admin API get role permissions from IDP -->
        <mxCell id="eAdminPermissions" value="Get role permissions" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#D97706;strokeWidth=1.5;endArrow=block;exitX=1;exitY=0.5;entryX=0.5;entryY=1;" edge="1" parent="1" source="adminApi" target="authService">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="640" y="375"/>
              <mxPoint x="640" y="270"/>
              <mxPoint x="810" y="270"/>
            </Array>
          </mxGeometry>
        </mxCell>

        <!-- Gateway Router proxies call to Microservices -->
        <mxCell id="eGatewayCallMicroservice" value="Call microservice" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#E11D48;strokeWidth=2;endArrow=block;exitX=0.5;exitY=1;entryX=0;entryY=0.5;" edge="1" parent="1" source="gatewayCore" target="cMicroservices">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="450" y="490"/>
            </Array>
          </mxGeometry>
        </mxCell>

        <!-- Microservices & Event Bus bidirectional messaging -->
        <mxCell id="eMicroservicesEventBus" value="Publish / Consume" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#EA580C;strokeWidth=1.5;endArrow=classic;startArrow=classic;" edge="1" parent="1" source="cMicroservices" target="eventBus">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>

        <!-- Microservices read/write cache to Redis -->
        <mxCell id="eMicroservicesRedis" value="Get / Set Cache" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#DC2626;strokeWidth=1.5;endArrow=block;exitX=0.25;exitY=1;entryX=0.5;entryY=0;" edge="1" parent="1" source="cMicroservices" target="redisCache">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>

        <!-- Microservices read/write persistent data to PostgreSQL -->
        <mxCell id="eMicroservicesPostgres" value="Query Database" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#7C3AED;strokeWidth=1.5;endArrow=block;exitX=0.75;exitY=1;entryX=0.5;entryY=0;" edge="1" parent="1" source="cMicroservices" target="postgresDb">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>

      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

---

## 2. Event Bus Communication Diagram (Draw.io XML)

This diagram details the Event-Driven architecture showing how microservices publish and subscribe to specific events over the RabbitMQ Bus.

```xml
<mxfile host="app.diagrams.net" modified="2026-08-06T00:00:00.000Z" agent="Codex" version="24.7.17" type="device">
  <diagram id="nexhire-event-bus-communication" name="NexHire Event Bus Flow">
    <mxGraphModel dx="1800" dy="1100" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1600" pageHeight="1200" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />

        <!-- Title -->
        <mxCell id="title" value="Event Bus (RabbitMQ) Communication Flow" style="text;html=1;strokeColor=none;fillColor=none;fontSize=24;fontStyle=1;fontColor=#1E293B;align=center;verticalAlign=middle;" vertex="1" parent="1">
          <mxGeometry x="350" y="30" width="900" height="50" as="geometry" />
        </mxCell>

        <!-- Publishers Swimlane -->
        <mxCell id="cPublishers" value="Publishers" style="swimlane;html=1;startSize=30;rounded=1;arcSize=10;strokeColor=#94A3B8;fillColor=#F8FAFC;fontColor=#1E293B;fontStyle=1;" vertex="1" parent="1">
          <mxGeometry x="50" y="120" width="260" height="870" as="geometry" />
        </mxCell>
        <mxCell id="pubAuth" value="Auth Service" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#F1F5F9;strokeColor=#64748B;fontColor=#0F172A;fontStyle=1;" vertex="1" parent="cPublishers">
          <mxGeometry x="30" y="60" width="200" height="60" as="geometry" />
        </mxCell>
        <mxCell id="pubCandidate" value="Candidate Service" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#F1F5F9;strokeColor=#64748B;fontColor=#0F172A;fontStyle=1;" vertex="1" parent="cPublishers">
          <mxGeometry x="30" y="200" width="200" height="60" as="geometry" />
        </mxCell>
        <mxCell id="pubCompany" value="Company Service" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#F1F5F9;strokeColor=#64748B;fontColor=#0F172A;fontStyle=1;" vertex="1" parent="cPublishers">
          <mxGeometry x="30" y="340" width="200" height="60" as="geometry" />
        </mxCell>
        <mxCell id="pubJob" value="Job Service" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#F1F5F9;strokeColor=#64748B;fontColor=#0F172A;fontStyle=1;" vertex="1" parent="cPublishers">
          <mxGeometry x="30" y="490" width="200" height="60" as="geometry" />
        </mxCell>
        <mxCell id="pubApplication" value="Application Service" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#F1F5F9;strokeColor=#64748B;fontColor=#0F172A;fontStyle=1;" vertex="1" parent="cPublishers">
          <mxGeometry x="30" y="640" width="200" height="60" as="geometry" />
        </mxCell>
        <mxCell id="pubCvParsing" value="CV Parsing Service" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#F1F5F9;strokeColor=#64748B;fontColor=#0F172A;fontStyle=1;" vertex="1" parent="cPublishers">
          <mxGeometry x="30" y="780" width="200" height="60" as="geometry" />
        </mxCell>

        <!-- RabbitMQ Event Bus Swimlane -->
        <mxCell id="cRabbitMQ" value="RabbitMQ Exchange &amp; Routing Keys" style="swimlane;html=1;startSize=30;rounded=1;arcSize=10;strokeColor=#FF8C00;fillColor=#FFFDF5;fontColor=#D97706;fontStyle=1;" vertex="1" parent="1">
          <mxGeometry x="440" y="120" width="340" height="870" as="geometry" />
        </mxCell>
        <mxCell id="keyAuth" value="auth.verification-email&lt;br&gt;auth.password-reset" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#FFF8E1;strokeColor=#FFB300;fontColor=#5D4037;" vertex="1" parent="cRabbitMQ">
          <mxGeometry x="30" y="60" width="280" height="60" as="geometry" />
        </mxCell>
        <mxCell id="keyCandidate" value="candidate.profile-snapshot-changed" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#FFF8E1;strokeColor=#FFB300;fontColor=#5D4037;" vertex="1" parent="cRabbitMQ">
          <mxGeometry x="30" y="200" width="280" height="60" as="geometry" />
        </mxCell>
        <mxCell id="keyCompany" value="company.posting-snapshot-changed" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#FFF8E1;strokeColor=#FFB300;fontColor=#5D4037;" vertex="1" parent="cRabbitMQ">
          <mxGeometry x="30" y="340" width="280" height="60" as="geometry" />
        </mxCell>
        <mxCell id="keyJob" value="job.published / job.closed&lt;br&gt;job.unpublished / job.review-trust-signal&lt;br&gt;job.revision-approved" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#FFF8E1;strokeColor=#FFB300;fontColor=#5D4037;" vertex="1" parent="cRabbitMQ">
          <mxGeometry x="30" y="490" width="280" height="60" as="geometry" />
        </mxCell>
        <mxCell id="keyApplication" value="application.submitted&lt;br&gt;application.stage-changed" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#FFF8E1;strokeColor=#FFB300;fontColor=#5D4037;" vertex="1" parent="cRabbitMQ">
          <mxGeometry x="30" y="640" width="280" height="60" as="geometry" />
        </mxCell>
        <mxCell id="keyCvParsing" value="cv.parse-requested&lt;br&gt;cv.parse-completed" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#FFF8E1;strokeColor=#FFB300;fontColor=#5D4037;" vertex="1" parent="cRabbitMQ">
          <mxGeometry x="30" y="780" width="280" height="60" as="geometry" />
        </mxCell>

        <!-- Consumers Swimlane -->
        <mxCell id="cConsumers" value="Consumers" style="swimlane;html=1;startSize=30;rounded=1;arcSize=10;strokeColor=#94A3B8;fillColor=#F8FAFC;fontColor=#1E293B;fontStyle=1;" vertex="1" parent="1">
          <mxGeometry x="910" y="120" width="260" height="870" as="geometry" />
        </mxCell>
        <mxCell id="conNotification" value="Notification Service" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#F0FDF4;strokeColor=#16A34A;fontColor=#14532D;fontStyle=1;" vertex="1" parent="cConsumers">
          <mxGeometry x="30" y="60" width="200" height="60" as="geometry" />
        </mxCell>
        <mxCell id="conMatching" value="Matching Service" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#F0FDF4;strokeColor=#16A34A;fontColor=#14532D;fontStyle=1;" vertex="1" parent="cConsumers">
          <mxGeometry x="30" y="200" width="200" height="60" as="geometry" />
        </mxCell>
        <mxCell id="conJob" value="Job Service" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#F0FDF4;strokeColor=#16A34A;fontColor=#14532D;fontStyle=1;" vertex="1" parent="cConsumers">
          <mxGeometry x="30" y="340" width="200" height="60" as="geometry" />
        </mxCell>
        <mxCell id="conApplication" value="Application Service" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#F0FDF4;strokeColor=#16A34A;fontColor=#14532D;fontStyle=1;" vertex="1" parent="cConsumers">
          <mxGeometry x="30" y="490" width="200" height="60" as="geometry" />
        </mxCell>
        <mxCell id="conCompany" value="Company Service" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#F0FDF4;strokeColor=#16A34A;fontColor=#14532D;fontStyle=1;" vertex="1" parent="cConsumers">
          <mxGeometry x="30" y="640" width="200" height="60" as="geometry" />
        </mxCell>
        <mxCell id="conCandidate" value="Candidate Service" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#F0FDF4;strokeColor=#16A34A;fontColor=#14532D;fontStyle=1;" vertex="1" parent="cConsumers">
          <mxGeometry x="30" y="780" width="200" height="60" as="geometry" />
        </mxCell>

        <!-- Edges: Publish -->
        <mxCell id="ePubAuth" value="Pub" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#EA580C;strokeWidth=1.5;endArrow=block;" edge="1" parent="1" source="pubAuth" target="keyAuth">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="ePubCandidate" value="Pub" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#EA580C;strokeWidth=1.5;endArrow=block;" edge="1" parent="1" source="pubCandidate" target="keyCandidate">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="ePubCompany" value="Pub" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#EA580C;strokeWidth=1.5;endArrow=block;" edge="1" parent="1" source="pubCompany" target="keyCompany">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="ePubJob" value="Pub" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#EA580C;strokeWidth=1.5;endArrow=block;" edge="1" parent="1" source="pubJob" target="keyJob">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="ePubApplication" value="Pub" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#EA580C;strokeWidth=1.5;endArrow=block;" edge="1" parent="1" source="pubApplication" target="keyApplication">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="ePubCvParsing" value="Pub" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#EA580C;strokeWidth=1.5;endArrow=block;" edge="1" parent="1" source="pubCvParsing" target="keyCvParsing">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>

        <!-- Edges: Consume -->
        <!-- Auth events consumed by Notification -->
        <mxCell id="eConAuthNotif" value="Sub" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#16A34A;strokeWidth=1.5;endArrow=block;exitX=1;exitY=0.5;entryX=0;entryY=0.5;" edge="1" parent="1" source="keyAuth" target="conNotification">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>

        <!-- Candidate profile-snapshot-changed consumed by Application -->
        <mxCell id="eConCandidateApp" value="Sub" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#16A34A;strokeWidth=1.5;endArrow=block;" edge="1" parent="1" source="keyCandidate" target="conApplication">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="830" y="370"/>
              <mxPoint x="830" y="645"/>
            </Array>
          </mxGeometry>
        </mxCell>

        <!-- Company posting snapshot consumed by Job -->
        <mxCell id="eConCompanyJob" value="Sub" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#16A34A;strokeWidth=1.5;endArrow=block;exitX=1;exitY=0.5;entryX=0;entryY=0.5;" edge="1" parent="1" source="keyCompany" target="conJob">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>

        <!-- Job events consumed by Application, Notification, Company, Matching -->
        <mxCell id="eConJobApp" value="Sub" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#16A34A;strokeWidth=1.5;endArrow=block;" edge="1" parent="1" source="keyJob" target="conApplication">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="800" y="548"/>
              <mxPoint x="800" y="645"/>
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="eConJobNotif" value="Sub" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#16A34A;strokeWidth=1.5;endArrow=block;" edge="1" parent="1" source="keyJob" target="conNotification">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="850" y="538"/>
              <mxPoint x="850" y="225"/>
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="eConJobCompany" value="Sub" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#16A34A;strokeWidth=1.5;endArrow=block;" edge="1" parent="1" source="keyJob" target="conCompany">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="820" y="558"/>
              <mxPoint x="820" y="770"/>
            </Array>
          </mxGeometry>
        </mxCell>
        <!-- job.published -> Matching (trigger auto-match for new job) -->
        <mxCell id="eConJobMatching" value="Sub (job.published)" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#16A34A;strokeWidth=1.5;endArrow=block;dashed=1;" edge="1" parent="1" source="keyJob" target="conMatching">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="860" y="542"/>
              <mxPoint x="860" y="360"/>
            </Array>
          </mxGeometry>
        </mxCell>

        <!-- Application events consumed by Matching, Notification, Job -->
        <mxCell id="eConAppMatching" value="Sub" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#16A34A;strokeWidth=1.5;endArrow=block;" edge="1" parent="1" source="keyApplication" target="conMatching">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="830" y="700"/>
              <mxPoint x="830" y="365"/>
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="eConAppNotif" value="Sub" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#16A34A;strokeWidth=1.5;endArrow=block;" edge="1" parent="1" source="keyApplication" target="conNotification">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="880" y="710"/>
              <mxPoint x="880" y="234"/>
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="eConAppJob" value="Sub" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#16A34A;strokeWidth=1.5;endArrow=block;" edge="1" parent="1" source="keyApplication" target="conJob">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="840" y="720"/>
              <mxPoint x="840" y="505"/>
            </Array>
          </mxGeometry>
        </mxCell>

        <!-- CV Parse events consumed by Candidate -->
        <mxCell id="eConCvCandidate" value="Sub (parse-completed)" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#16A34A;strokeWidth=1.5;endArrow=block;exitX=1;exitY=0.5;entryX=0;entryY=0.5;" edge="1" parent="1" source="keyCvParsing" target="conCandidate">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>

      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

---

## 3. System ERD (Entity Relationship Diagram)

This entity relationship diagram maps all the databases and schemas utilized across the microservices. It presents field names, data types, and nullability constraints. All ORM relationship decorators (TypeORM `@OneToMany`, `@ManyToOne` etc.) have been excluded — only actual database columns are listed.

> **Type legend:** `varchar` = varchar/text/uuid column | `int` = integer | `float8` = double precision | `bool` = boolean | `jsonb` = jsonb | `timestamptz` = timestamp with time zone | `enum` = postgres native enum | `array` = postgres array column

```mermaid
erDiagram
    %% ─────────────── Auth Service ───────────────
    users {
        uuid id PK
        varchar email not_null
        varchar phone null
        varchar fullName null
        varchar avatarUrl null
        varchar avatarDocumentId null
        varchar language not_null
        bool emailVerified not_null
        timestamptz lastLoginAt null
        varchar status not_null
        varchar statusReason null
        varchar statusChangedBy null
        timestamptz statusChangedAt null
        timestamptz suspendedAt null
        timestamptz bannedAt null
        timestamptz archivedAt null
        timestamptz createdAt not_null
        timestamptz updatedAt not_null
    }

    user_credentials {
        uuid id PK
        uuid userId not_null
        varchar passwordHash not_null
        timestamptz passwordUpdatedAt not_null
        int failedLoginAttempts not_null
        timestamptz lockedUntil null
        timestamptz createdAt not_null
        timestamptz updatedAt not_null
    }

    roles {
        varchar id PK
        varchar description null
        timestamptz createdAt not_null
    }

    user_roles {
        uuid id PK
        uuid userId not_null
        varchar roleId not_null
        timestamptz createdAt not_null
    }

    email_verifications {
        uuid id PK
        uuid userId not_null
        varchar email not_null
        varchar tokenHash not_null
        timestamptz expiresAt not_null
        timestamptz verifiedAt null
        timestamptz lastSentAt not_null
        int resendCount not_null
        timestamptz createdAt not_null
    }

    password_reset_tokens {
        uuid id PK
        uuid userId not_null
        varchar email not_null
        varchar tokenHash not_null
        timestamptz expiresAt not_null
        timestamptz usedAt null
        timestamptz lastSentAt not_null
        int resendCount not_null
        timestamptz createdAt not_null
    }

    auth_identities {
        uuid id PK
        uuid userId not_null
        varchar providerUserId not_null
        varchar email not_null
        bool emailVerified not_null
        varchar fullName null
        varchar avatarUrl null
        timestamptz linkedAt not_null
        timestamptz lastLoginAt null
        timestamptz createdAt not_null
        timestamptz updatedAt not_null
    }

    recruiter_company_links {
        uuid id PK
        uuid userId not_null
        uuid companyId not_null
        varchar companyName null
        varchar companyLogoUrl null
        uuid companyLogoDocumentId null
        varchar companyStatus not_null
        timestamptz lastSyncedAt not_null
        timestamptz createdAt not_null
        timestamptz updatedAt not_null
    }

    %% ─────────────── Candidate Service ───────────────
    candidate_profiles {
        uuid userId PK
        varchar fullName null
        varchar phone null
        varchar contactEmail null
        uuid avatarDocumentId null
        varchar headline null
        varchar summary null
        varchar location null
        varchar portfolioUrl null
        varchar linkedinUrl null
        varchar language not_null
        bool openToWork not_null
        timestamptz createdAt not_null
        timestamptz updatedAt not_null
    }

    candidate_skills {
        uuid id PK
        uuid candidateId not_null
        varchar name not_null
        varchar normalizedName not_null
        int yearsOfExperience null
        timestamptz createdAt not_null
        timestamptz updatedAt not_null
    }

    candidate_experiences {
        uuid id PK
        uuid candidateId not_null
        varchar companyName not_null
        varchar position not_null
        int startMonth null
        int startYear null
        int endMonth null
        int endYear null
        bool isCurrent not_null
        varchar description null
        timestamptz createdAt not_null
        timestamptz updatedAt not_null
    }

    candidate_educations {
        uuid id PK
        uuid candidateId not_null
        varchar schoolName not_null
        varchar degree null
        varchar fieldOfStudy null
        int startYear null
        int endYear null
        bool isCurrent not_null
        varchar description null
        timestamptz createdAt not_null
        timestamptz updatedAt not_null
    }

    candidate_certifications {
        uuid id PK
        uuid candidateId not_null
        varchar name not_null
        varchar issuer null
        varchar credentialUrl null
        int issuedYear null
        varchar description null
        timestamptz createdAt not_null
        timestamptz updatedAt not_null
    }

    candidate_projects {
        uuid id PK
        uuid candidateId not_null
        varchar name not_null
        varchar description null
        array technologies not_null
        varchar projectUrl null
        timestamptz createdAt not_null
        timestamptz updatedAt not_null
    }

    candidate_cvs {
        uuid id PK
        uuid candidateId not_null
        uuid documentId not_null
        varchar title null
        bool isDefault not_null
        uuid sourceTemplateId null
        uuid sourceCvId null
        timestamptz parsedAt null
        timestamptz deletedAt null
        timestamptz documentDeletedAt null
        varchar documentDeleteError null
        timestamptz createdAt not_null
        timestamptz updatedAt not_null
    }

    candidate_cv_templates {
        uuid id PK
        uuid candidateId not_null
        varchar name not_null
        uuid sourceDocumentId null
        timestamptz sourceDocumentDeletedAt null
        uuid sourceCvId null
        uuid sourceParseRequestId null
        jsonb theme not_null
        jsonb layout not_null
        jsonb contentSnapshot not_null
        jsonb canvas not_null
        bool isDefault not_null
        uuid lastExportedCvId null
        timestamptz lastExportedAt null
        timestamptz createdAt not_null
        timestamptz updatedAt not_null
        timestamptz deletedAt null
    }

    saved_jobs {
        uuid id PK
        uuid candidateId not_null
        uuid candidateUserId not_null
        uuid jobId not_null
        varchar jobTitle not_null
        uuid companyId not_null
        varchar companyName null
        varchar companyLogoUrl null
        uuid companyLogoDocumentId null
        varchar location null
        int salaryMin null
        int salaryMax null
        varchar salaryCurrency not_null
        bool isSalaryVisible not_null
        timestamptz deadline null
        timestamptz publishedAt null
        timestamptz createdAt not_null
        timestamptz updatedAt not_null
    }

    followed_companies {
        uuid id PK
        uuid candidateId not_null
        uuid candidateUserId not_null
        uuid companyId not_null
        varchar companyName not_null
        varchar companyLogoUrl null
        uuid companyLogoDocumentId null
        timestamptz createdAt not_null
        timestamptz updatedAt not_null
    }

    %% ─────────────── Company Service ───────────────
    companies {
        uuid id PK
        varchar name not_null
        varchar logo null
        uuid logoDocumentId null
        varchar description null
        varchar industry null
        varchar size null
        int foundedYear null
        varchar mission null
        varchar culture null
        array values not_null
        array perks not_null
        varchar heroImageUrl null
        uuid heroImageDocumentId null
        varchar website null
        varchar contactEmail null
        varchar contactPhone null
        varchar address null
        varchar taxCode not_null
        uuid ownerId not_null
        enum status not_null
        varchar statusReason null
        timestamptz statusChangedAt null
        uuid statusChangedByUserId null
        int verificationRejectedCount not_null
        varchar lastVerificationRejectedReason null
        timestamptz lastVerificationRejectedAt null
        timestamptz verificationReviewRequestedAt null
        uuid verificationReviewRequestedByUserId null
        int approvedLowRiskCount not_null
        int negativeTrustSignalCount not_null
        timestamptz createdAt not_null
        timestamptz updatedAt not_null
        timestamptz deletedAt null
    }

    company_verification_documents {
        uuid id PK
        uuid companyId not_null
        uuid documentId not_null
        enum type not_null
        uuid uploadedByUserId not_null
        timestamptz createdAt not_null
        timestamptz updatedAt not_null
        timestamptz deletedAt null
    }

    company_trust_histories {
        uuid id PK
        uuid companyId not_null
        uuid changedByUserId null
        varchar reason not_null
        jsonb metadata not_null
        timestamptz createdAt not_null
    }

    company_processed_trust_signals {
        uuid id PK
        uuid companyId not_null
        varchar targetType not_null
        uuid targetId not_null
        timestamptz processedAt not_null
    }

    %% ─────────────── Job Service ───────────────
    job_categories {
        uuid id PK
        varchar name not_null
        varchar slug not_null
        varchar description null
        int sortOrder not_null
        bool isActive not_null
    }

    company_posting_snapshots {
        uuid companyId PK
        varchar companyName null
        varchar companyLogoUrl null
        uuid companyLogoDocumentId null
        enum companyStatus not_null
        enum companyTrustLevel not_null
        timestamptz snapshotAt not_null
        timestamptz updatedAt not_null
    }

    jobs {
        uuid id PK
        uuid companyId not_null
        varchar companyName null
        varchar companyLogoUrl null
        uuid companyLogoDocumentId null
        timestamptz companySnapshotAt not_null
        uuid createdByUserId not_null
        varchar title not_null
        varchar description null
        varchar requirements null
        array skills not_null
        varchar benefits null
        uuid categoryId null
        varchar location null
        int salaryMin null
        int salaryMax null
        varchar salaryCurrency not_null
        bool isSalaryVisible not_null
        timestamptz deadline null
        int numberOfOpenings null
        enum status not_null
        enum employmentType null
        enum workingType null
        enum experienceLevel null
        int version not_null
        int applicationCount not_null
        timestamptz publishedAt null
        timestamptz closedAt null
        timestamptz expiresAt null
        int riskScore null
        array moderationReasons not_null
        array moderationMatchedRules not_null
        uuid reviewedByUserId null
        timestamptz reviewedAt null
        varchar reviewReason null
        uuid unpublishedByUserId null
        timestamptz unpublishedAt null
        varchar unpublishReason null
        varchar searchTitle not_null
        varchar searchDescription not_null
        varchar searchRequirements not_null
        varchar searchSkills not_null
        varchar searchCompanyName not_null
        varchar searchLocation not_null
        varchar searchText not_null
        timestamptz createdAt not_null
        timestamptz updatedAt not_null
        timestamptz deletedAt null
    }

    job_revisions {
        uuid id PK
        uuid jobId not_null
        uuid companyId not_null
        uuid createdByUserId not_null
        varchar title not_null
        varchar description null
        varchar requirements null
        array skills not_null
        varchar benefits null
        uuid categoryId null
        varchar location null
        int salaryMin null
        int salaryMax null
        varchar salaryCurrency not_null
        bool isSalaryVisible not_null
        timestamptz deadline null
        int numberOfOpenings null
        enum status not_null
        varchar changeSummary null
        int riskScore null
        array moderationReasons not_null
        array moderationMatchedRules not_null
        uuid reviewedByUserId null
        timestamptz reviewedAt null
        varchar reviewReason null
        timestamptz createdAt not_null
        timestamptz updatedAt not_null
        timestamptz deletedAt null
    }

    job_moderation_reviews {
        uuid id PK
        uuid jobId not_null
        enum targetType not_null
        uuid targetId not_null
        int riskScore not_null
        enum riskLevel not_null
        enum decision not_null
        array reasons not_null
        array matchedRules not_null
        uuid reviewedByUserId null
        timestamptz reviewedAt null
        enum adminDecision null
        varchar adminReason null
        timestamptz createdAt not_null
        timestamptz deletedAt null
    }

    job_processed_application_events {
        uuid applicationId PK
        uuid jobId not_null
        uuid candidateId not_null
        timestamptz processedAt not_null
    }

    %% ─────────────── Application Service ───────────────
    applications {
        uuid id PK
        uuid jobId not_null
        varchar jobTitle not_null
        uuid companyId not_null
        varchar companyName null
        varchar companyLogoUrl null
        uuid companyLogoDocumentId null
        uuid candidateId not_null
        uuid candidateUserId not_null
        varchar candidateFullName null
        varchar candidateEmail null
        varchar candidatePhone null
        uuid candidateAvatarDocumentId null
        uuid candidateCvId not_null
        uuid cvDocumentId not_null
        varchar cvTitle null
        varchar cvFileName not_null
        varchar cvMimeType not_null
        int cvSize not_null
        enum cvParseStatus not_null
        varchar coverLetter null
        enum status not_null
        varchar statusNote null
        int matchScore null
        enum matchLevel null
        bool autoMatchRequested not_null
        timestamptz submittedAt not_null
        timestamptz withdrawnAt null
        timestamptz decidedAt null
        timestamptz cancelledAt null
        timestamptz firstCvReceivedAt null
        timestamptz firstCvViewedAt null
        timestamptz createdAt not_null
        timestamptz updatedAt not_null
        timestamptz deletedAt null
    }

    application_progress_events {
        uuid id PK
        uuid applicationId not_null
        enum step not_null
        varchar title not_null
        varchar description null
        enum actorType not_null
        uuid actorUserId null
        varchar note null
        jsonb metadata null
        timestamptz occurredAt not_null
        timestamptz createdAt not_null
    }

    %% ─────────────── CV Parsing Service ───────────────
    cv_parse_requests {
        uuid id PK
        uuid candidateId not_null
        uuid requestedByUserId not_null
        uuid candidateCvId null
        uuid documentId not_null
        varchar documentUrl null
        enum status not_null
        varchar providerVersion null
        varchar contentHash null
        varchar errorCode null
        varchar errorMessage null
        timestamptz createdAt not_null
        timestamptz updatedAt not_null
    }

    cv_parse_results {
        uuid id PK
        uuid parseRequestId not_null
        uuid candidateId not_null
        uuid candidateCvId null
        uuid documentId not_null
        varchar providerVersion null
        jsonb normalizedPayload not_null
        jsonb rawProviderPayload null
        jsonb confidence null
        timestamptz createdAt not_null
    }

    ai_system_configs {
        varchar key PK
        varchar configValue not_null
        uuid updatedByUserId null
        timestamptz createdAt not_null
        timestamptz updatedAt not_null
    }

    ai_usage_logs {
        uuid id PK
        uuid parseRequestId not_null
        uuid candidateId not_null
        uuid candidateCvId null
        varchar model not_null
        varchar operation not_null
        enum status not_null
        int latencyMs null
        int inputTokens null
        int outputTokens null
        int totalTokens null
        varchar estimatedCostUsd null
        varchar errorCode null
        varchar errorMessage null
        jsonb metadata null
        timestamptz createdAt not_null
    }

    %% ─────────────── Document Storage Service ───────────────
    documents {
        uuid id PK
        enum documentType not_null
        enum ownerType not_null
        uuid ownerId not_null
        varchar fileName not_null
        varchar mimeType not_null
        int size not_null
        varchar key not_null
        timestamptz createdAt not_null
        timestamptz updatedAt not_null
        timestamptz deletedAt null
    }

    %% ─────────────── Matching Service ───────────────
    match_results {
        uuid id PK
        uuid jobId not_null
        uuid candidateId not_null
        uuid candidateCvId null
        uuid applicationId null
        enum status not_null
        enum provider not_null
        varchar modelVersion null
        float8 totalScore not_null
        float8 skillScore not_null
        float8 experienceScore not_null
        float8 educationScore not_null
        float8 certificationScore not_null
        float8 projectScore not_null
        float8 preferenceScore not_null
        float8 semanticScore not_null
        jsonb explanation not_null
        varchar errorCode null
        varchar errorMessage null
        timestamptz createdAt not_null
    }

    %% ─────────────── Notification Service ───────────────
    notifications {
        uuid id PK
        enum recipientType not_null
        uuid recipientUserId null
        uuid recipientCompanyId null
        varchar dedupeKey not_null
        enum senderType not_null
        uuid senderEntityId null
        varchar senderName null
        uuid senderAvatarDocumentId null
        varchar senderLogoUrl null
        enum type not_null
        varchar title not_null
        varchar body not_null
        jsonb data not_null
        timestamptz readAt null
        timestamptz createdAt not_null
        timestamptz updatedAt not_null
    }

    %% ─────────────── Relationships ───────────────

    %% Auth Service
    users ||--o| user_credentials : "credential"
    users ||--o{ user_roles : "roles"
    users ||--o{ email_verifications : "verifications"
    users ||--o{ password_reset_tokens : "reset_tokens"
    users ||--o{ auth_identities : "identities"
    users ||--o{ recruiter_company_links : "company_links"
    roles ||--o{ user_roles : "assignments"

    %% Candidate Service
    candidate_profiles ||--o{ candidate_skills : "skills"
    candidate_profiles ||--o{ candidate_experiences : "experiences"
    candidate_profiles ||--o{ candidate_educations : "educations"
    candidate_profiles ||--o{ candidate_certifications : "certifications"
    candidate_profiles ||--o{ candidate_projects : "projects"
    candidate_profiles ||--o{ candidate_cvs : "cvs"
    candidate_profiles ||--o{ candidate_cv_templates : "templates"
    candidate_profiles ||--o{ saved_jobs : "saved_jobs"
    candidate_profiles ||--o{ followed_companies : "followed"

    %% CV to Document
    candidate_cvs ||--|| documents : "document"
    candidate_cvs ||--o{ cv_parse_requests : "parse_requests"

    %% CV Parsing
    cv_parse_requests ||--o| cv_parse_results : "result"
    cv_parse_requests ||--o{ ai_usage_logs : "ai_logs"

    %% Company Service
    companies ||--o{ company_verification_documents : "documents"
    companies ||--o{ company_trust_histories : "trust_log"
    companies ||--o{ recruiter_company_links : "recruiters"
    companies ||--o{ jobs : "jobs"

    %% Job Service
    job_categories ||--o{ jobs : "category"
    company_posting_snapshots ||--o{ jobs : "snapshot"
    jobs ||--o{ job_revisions : "revisions"
    jobs ||--o{ job_moderation_reviews : "moderation_reviews"
    job_revisions ||--o{ job_moderation_reviews : "revision_reviews"

    %% Application Service
    jobs ||--o{ applications : "applications"
    applications ||--o{ application_progress_events : "history"
    applications ||--o| match_results : "match"

```

---

## 4. Architectural Component Descriptions

Based on the actual NestJS codebase and infrastructure configuration, the components depicted in the diagrams play the following roles:

### 1. Client Apps
- **Candidate / Recruiter App (Web / Mobile)**: Interacts with the backend services through the public API endpoints exposed by the API Gateway core.
- **Web Admin Dashboard (CMS / Backoffice)**: Utilized by administrators to manage users, company reviews, job revision reviews, and analytics. It communicates specifically with the admin-facing endpoints in the Gateway.

### 2. API Gateway
The central entry point of the backend system, implemented in `apps/gateway`:
- **Reverse Proxy / Router (`gateway/proxy`)**: Decodes incoming JWT tokens (using local cryptographic verification with `JwtStrategy` and `OptionalJwtAuthGuard`), handles rate-limiting, and routes standard client requests to the respective microservices.
- **Admin API Module (`gateway/admin-dashboard`)**: Exposes dedicated administrative endpoints. It orchestrates aggregate data queries by communicating internally with other services (such as `authService`, `companyService`, and `jobService`) to build unified analytics for the admin interface.

### 3. IDP Service (`auth-service`)
- Manages user identity, credentials, registration, Google OAuth integration, and JWT signing.
- Serves as the Identity Provider (IDP). The Gateway and Admin API delegate user login flows to it, which returns the authorization tokens.

### 4. Microservices Container
A collection of independent services that handle the core business domain of NexHire:
- **Job Service (`job-service`)**: Manages job postings, draft states, revisions, search indexes, and moderation workflows.
- **Candidate Service (`candidate-service`)**: Manages candidate CV profiles, experiences, education, and user-profile settings.
- **Company Service (`company-service`)**: Manages recruiter companies, snapshots, status, and verification reviews.
- **Application Service (`application-service`)**: Manages job application submissions and stage updates.
- **CV Parsing Service (`cv-parsing-service`)**: Orchestrates CV document ingestion and text parsing using external AI providers (Gemini API).
- **Document Storage Service (`document-storage-service`)**: Handles storage credentials, metadata mapping, and secure file download/upload URLs (MinIO/S3).
- **Matching Service (`matching-service`)**: Computes matches between candidate profiles and job requirements.
- **Notification Service (`notification-service`)**: Dispatches email, SMS, or web push alerts based on system events.

### 5. Event Bus (RabbitMQ)
- Enables asynchronous, decoupled event-driven communication between services.
- **Publishers & routing keys:**
  - Auth Service → `auth.verification-email`, `auth.password-reset`
  - Candidate Service → `candidate.profile-snapshot-changed`
  - Company Service → `company.posting-snapshot-changed`
  - Job Service → `job.published`, `job.closed`, `job.unpublished`, `job.review-trust-signal`, `job.revision-approved`
  - Application Service → `application.submitted`, `application.stage-changed`
  - CV Parsing Service → `cv.parse-requested`, `cv.parse-completed`
- Interested microservices subscribe to these events asynchronously to update local state snapshots or trigger side-effects (e.g., matching or dispatching notifications).

### 8. External Providers
- **Google OAuth 2.0**: Used by the Auth Service to support social login via Google accounts.
- **Gemini API**: Used by the CV Parsing Service to extract and normalize structured data from candidate CV documents.
- **MinIO / S3 (Object Storage)**: Used by the Document Storage Service for persisting uploaded files and generating pre-signed download URLs.

### 6. Cache Server (Redis)
- Used for caching read-heavy data, managing temporary auth refresh session tokens, and resolving pre-signed MinIO document download URLs near expiration.

### 7. Databases (PostgreSQL)
- Relational storage using separate schemas or databases for each microservice to preserve service isolation.
