\# Bitespeed Identity Reconciliation



A backend service that identifies and links customer contacts across multiple purchases, as per the Bitespeed task.



\## Live Endpoint

\*\*Base URL:\*\* `https://bitespeed-identity-bx9u.onrender.com`



\## API Usage



\### `POST /identify`

Accepts contact information and returns the consolidated contact details.



\*\*Request Body\*\* (JSON):

```json

{

&nbsp; "email": "user@example.com",

&nbsp; "phoneNumber": "1234567890"

}

