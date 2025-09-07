import { useState } from 'react';
import { Box, TextField, Button } from '@mui/material';
import axios from 'axios';

const endpointMapping = {
  Notion: 'notion',
  Airtable: 'airtable',
  Hubspot: 'hubspot',
};

export const DataForm = ({ integrationType, credentials }) => {
  const [loadedData, setLoadedData] = useState(null);
  const endpoint = endpointMapping[integrationType];

  const handleLoad = async () => {
    try {
      const form = new FormData();
      form.append('credentials', JSON.stringify(credentials || {}));
      const res = await axios.post(
        `http://localhost:8000/integrations/${endpoint}/get_${endpoint}_items`,
        form
      );
      setLoadedData(res.data);
    } catch (e) {
      setLoadedData({ error: e?.response?.data || e.message });
    }
  };

  return (
    <Box sx={{ mt: 2 }}>
      <TextField
        label="Loaded Data"
        value={loadedData ? JSON.stringify(loadedData, null, 2) : ''}
        multiline
        minRows={4}
        maxRows={10}
        sx={{ width: 400 }}
      />
      <Button onClick={handleLoad} sx={{ mt: 2 }} variant="contained">
        Load Data
      </Button>
      <Button onClick={() => setLoadedData(null)} sx={{ mt: 1 }} variant="contained">
        Clear Data
      </Button>
    </Box>
  );
};
