import { createApp } from './app';

// Long-running server entry (Render, Koyeb, local). Vercel uses api/index.ts.
const port = Number(process.env.PORT ?? 3000);
createApp().listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`FGEHA×NLC reference server listening on :${port}`);
});
