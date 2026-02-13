import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import uraRoutes from './routes/ura.js';
import { buildDashboardData } from './services/uraService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use('/api', uraRoutes);

app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ success: false, error: err.message });
});

app.listen(PORT, async () => {
  console.log(`🚀 Server on port ${PORT}`);
  // Pre-build dashboard data on startup
  try {
    console.log('📊 Pre-building dashboard data...');
    await buildDashboardData();
    console.log('✅ Dashboard data ready');
  } catch (err) {
    console.error('⚠️ Startup build failed (will retry on first request):', err.message);
  }
});
