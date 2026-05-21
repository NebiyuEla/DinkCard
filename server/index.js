import { createApp } from './app.js';
import { config } from './config.js';

const app = createApp();
app.listen(config.port, () => {
  console.log(`DinkCard API running on http://localhost:${config.port}`);
});
