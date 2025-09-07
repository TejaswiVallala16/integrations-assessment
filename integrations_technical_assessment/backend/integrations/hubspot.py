import json
import secrets
from fastapi import Request, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
import requests
from integrations.integration_item import IntegrationItem
from redis_client import add_key_value_redis, get_value_redis, delete_key_redis

# TODO: Replace with your HubSpot developer app credentials
CLIENT_ID = 'Your ID'
CLIENT_SECRET = 'Secrete'
REDIRECT_URI = "http://localhost:8000/integrations/hubspot/oauth2callback"
SCOPES = "crm.objects.contacts.read crm.objects.deals.read"

AUTH_URL = "http://app.hubspot.com/oauth/authorize"
TOKEN_URL = "https://api.hubapi.com/oauth/v1/token"
API_BASE = "https://api.hubapi.com"


# Step 1: Authorize
async def authorize_hubspot(user_id, org_id):
    state = secrets.token_urlsafe(16)
    await add_key_value_redis(
        f"hubspot_state:{state}",
        json.dumps({"user_id": user_id, "org_id": org_id}),
        expire=600,
    )

    oauth_url = (
        f"{AUTH_URL}?client_id={CLIENT_ID}"
        f"&redirect_uri={REDIRECT_URI}"
        f"&scope={SCOPES}"
        f"&state={state}"
    )

    return HTMLResponse(
        content=f"<html><script>window.location='{oauth_url}'</script></html>"
    )


# Step 2: Callback from HubSpot
async def oauth2callback_hubspot(request: Request):
    code = request.query_params.get("code")
    state = request.query_params.get("state")

    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing code or state")

    state_raw = await get_value_redis(f"hubspot_state:{state}")
    if not state_raw:
        raise HTTPException(status_code=400, detail="Invalid or expired state")
    state_data = json.loads(state_raw)
    user_id, org_id = state_data["user_id"], state_data["org_id"]

    data = {
        "grant_type": "authorization_code",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "redirect_uri": REDIRECT_URI,
        "code": code,
    }
    resp = requests.post(TOKEN_URL, data=data)
    if resp.status_code != 200:
        raise HTTPException(status_code=500, detail="Token exchange failed")

    tokens = resp.json()
    await add_key_value_redis(
        f"hubspot_credentials:{org_id}:{user_id}", json.dumps(tokens), expire=600
    )
    await delete_key_redis(f"hubspot_state:{state}")

    return HTMLResponse("<html><script>window.close();</script></html>")


# Step 3: Credentials fetch (frontend polling)
async def get_hubspot_credentials(user_id, org_id):
    creds = await get_value_redis(f"hubspot_credentials:{org_id}:{user_id}")
    if not creds:
        raise HTTPException(status_code=400, detail="No credentials found.")
    await delete_key_redis(f"hubspot_credentials:{org_id}:{user_id}")
    return json.loads(creds)


# Step 4: Fetch HubSpot items
async def get_items_hubspot(credentials) -> list:
    if isinstance(credentials, str):
        credentials = json.loads(credentials)
    token = credentials.get("access_token")
    if not token:
        raise HTTPException(status_code=400, detail="Missing access token")

    headers = {"Authorization": f"Bearer {token}"}
    items = []

    # Fetch Contacts
    contacts_url = f"{API_BASE}/crm/v3/objects/contacts?limit=5&properties=firstname,lastname,email"
    r = requests.get(contacts_url, headers=headers)
    if r.status_code == 200:
        for c in r.json().get("results", []):
            props = c.get("properties", {})
            items.append(
                IntegrationItem(
                    id=c.get("id"),
                    type="Contact",
                    name=f"{props.get('firstname','')} {props.get('lastname','')}".strip() or props.get("email"),
                ).__dict__
            )

    # Fetch Deals
    deals_url = f"{API_BASE}/crm/v3/objects/deals?limit=5&properties=dealname,amount"
    r = requests.get(deals_url, headers=headers)
    if r.status_code == 200:
        for d in r.json().get("results", []):
            props = d.get("properties", {})
            items.append(
                IntegrationItem(
                    id=d.get("id"),
                    type="Deal",
                    name=props.get("dealname"),
                ).__dict__
            )

    return items
