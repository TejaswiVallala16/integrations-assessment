// frontend/src/integrations/hubspot.js

import { useState, useEffect } from 'react';
import {
    Box,
    Button,
    CircularProgress
} from '@mui/material';
import axios from 'axios';

export const HubSpotIntegration = ({ user, org, integrationParams, setIntegrationParams }) => {
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);

    const handleConnectClick = async () => {
        try {
            setIsConnecting(true);

            // Open popup immediately (so browser won't block)
            const width = 600, height = 700;
            const left = window.screenX + (window.outerWidth - width) / 2;
            const top = window.screenY + (window.outerHeight - height) / 2;
            const popup = window.open('', 'hubspot_oauth', `width=${width},height=${height},left=${left},top=${top}`);
            console.log('popup opened?', !!popup, popup && popup.closed);

            // Prepare form data (use IDs if present, else fallback to raw values)
            const form = new FormData();
            form.append('user_id', user?.id ?? user);
            form.append('org_id', org?.id ?? org);

            // Ask backend for HubSpot authorize HTML
            const resp = await axios.post('http://localhost:8000/integrations/hubspot/authorize', form, { responseType: 'text' });
            const html = resp.data || '';

            // Extract oauth URL from backend HTML (window.location = "URL")
            const match = html.match(/window\.location\s*=\s*["']([^"']+)["']/);
            const oauthUrl = match ? match[1] : null;
            console.log('authorize response length:', html.length, 'extracted oauthUrl:', oauthUrl);

            if (oauthUrl) {
                try {
                    if (!popup || popup.closed) {
                        console.warn('popup blocked/closed — opening oauth URL in new tab');
                        window.open(oauthUrl, '_blank');
                    } else {
                        console.log('navigating popup to oauth url');
                        popup.location.href = oauthUrl;
                    }
                } catch (err) {
                    console.error('error navigating popup, opening new tab', err);
                    window.open(oauthUrl, '_blank');
                }
            } else {
                // Fallback: write backend HTML into popup
                console.warn('no oauth url found; writing backend HTML into popup');
                try {
                    if (!popup || popup.closed) {
                        const w = window.open();
                        w.document.open();
                        w.document.write(html);
                        w.document.close();
                    } else {
                        popup.document.open();
                        popup.document.write(html);
                        popup.document.close();
                    }
                } catch (e) {
                    console.error('failed writing html into popup', e);
                }
            }

            // Poll backend for credentials until success or popup closed
            const poll = async () => {
                try {
                    const credForm = new FormData();
                    credForm.append('user_id', user?.id ?? user);
                    credForm.append('org_id', org?.id ?? org);
                    const res = await axios.post('http://localhost:8000/integrations/hubspot/credentials', credForm);
                    if (res?.data) {
                        setIntegrationParams({
                            type: 'HubSpot',
                            credentials: res.data
                        });
                        setIsConnected(true);
                        setIsConnecting(false);
                        try { if (popup && !popup.closed) popup.close(); } catch(e){}
                        return;
                    }
                } catch (e) {
                    // ignore until available
                }
                if (popup && !popup.closed) {
                    setTimeout(poll, 1200);
                } else {
                    setIsConnecting(false);
                }
            };
            setTimeout(poll, 1200);

        } catch (e) {
            setIsConnecting(false);
            console.error('Failed to initiate OAuth:', e);
            alert(e?.response?.data?.detail || 'Failed to initiate OAuth.');
        }
    };

    useEffect(() => {
        setIsConnected(Boolean(integrationParams?.credentials));
    }, [integrationParams]);

    return (
        <Box sx={{ mt: 2 }}>
            <Box display='flex' alignItems='center' justifyContent='space-between' sx={{ mt: 2 }}>
                <Box>OAuth</Box>
                <Button
                    onClick={handleConnectClick}
                    variant='contained'
                    disabled={isConnecting || isConnected}
                    style={{
                        pointerEvents: isConnected ? 'none' : 'auto',
                        cursor: isConnected ? 'default' : 'pointer',
                        opacity: isConnected ? 1 : undefined
                    }}
                >
                    {isConnected ? 'HubSpot Connected' : isConnecting ? <CircularProgress size={20} /> : 'Connect to HubSpot'}
                </Button>
            </Box>
        </Box>
    );
};
