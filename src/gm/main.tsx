import '@fontsource/ruslan-display/400.css';
import { createRoot } from 'react-dom/client';
import '../styles/app.css';
import { loadFonts } from '../render/fonts';
import { initCloud } from '../cloud/sync';
import { focusFinder } from '../state/backdrop';
import { boot } from '../state/boot';
import { detectFocus } from './backdropFocus';
import { App } from './App';
import { installHotkeys } from './hotkeys';
import { initPlayerOutput } from './playerHub';

createRoot(document.getElementById('root')!).render(<App />);
installHotkeys();
void loadFonts();
focusFinder.find = detectFocus;
void boot().then(() => {
  initPlayerOutput();
  void initCloud();
});
