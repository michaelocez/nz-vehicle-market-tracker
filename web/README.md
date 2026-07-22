# Dashboard frontend

This is the static React/Vite frontend for NZ Vehicle Market Tracker. It reads
the versioned production aggregates in `../data/production/current`; it never
reads or serves raw vehicle records.

```powershell
npm install
npm run dev
```

The local dashboard is available at `http://localhost:3000`. Development and
production builds first copy the required aggregate files into the ignored
`public/data/` directory.

Run the complete frontend verification with:

```powershell
npm test
```

The production output is a self-contained static site under `dist/`. Asset and
data paths are relative so the output can be hosted beneath a GitHub Pages
repository path.
