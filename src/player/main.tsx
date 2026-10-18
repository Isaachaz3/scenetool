import '@fontsource/ruslan-display/400.css';
import { createRoot } from 'react-dom/client';
import '../styles/player.css';
import { loadFonts } from '../render/fonts';
import { PlayerApp } from './PlayerApp';
import { connect } from './session';

connect();
void loadFonts().then(() => {
  createRoot(document.getElementById('root')!).render(<PlayerApp />);
});
