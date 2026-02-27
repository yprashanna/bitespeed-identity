import express from 'express';
import dotenv from 'dotenv';
import { initDb } from './db';
import { identify } from './identify';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.post('/identify', async (req, res) => {
  try {
    const { email, phoneNumber } = req.body;
    if (!email && !phoneNumber) {
      return res.status(400).json({ error: 'Either email or phoneNumber must be provided' });
    }
    const response = await identify({ email, phoneNumber });
    res.json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/', (req, res) => {
  res.send('Bitespeed Identity Service is running');
});

app.listen(port, async () => {
  await initDb(); // create tables if not exist
  console.log(`Server listening on port ${port}`);
});