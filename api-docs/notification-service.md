# Notification Service API Docs

Base path through gateway:
- `/api/v1/notifications`

Responsibility: email and web push notifications.

## Email links

Verification and password-reset emails include both:

- link flow for FE pages,
- OTP fallback for manual input.

Frontend URL config:

```env
FRONTEND_URL=http://localhost:5173
FRONTEND_VERIFY_EMAIL_PATH=/verify-email
FRONTEND_RESET_PASSWORD_PATH=/reset-password
```

## Endpoints

Add each notification endpoint here when implemented.

Use the template from [README.md](README.md#endpoint-section-template).

