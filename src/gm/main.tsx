import '@fontsource/ruslan-display/400.css';
import { createRoot } from 'react-dom/client';
import '../styles/app.css';
import { loadFonts } from '../render/fonts';
import { boot } from '../state/boot';
import { App } from './App';
import { installHotkeys } from './hotkeys';
import { initPlayerOutput } from './playerHub';

createRoot(document.getElementById('root')!).render(<App />);
installHotkeys();
void loadFonts();
void boot().then(() => initPlayerOutput());
