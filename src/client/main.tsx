import { createRoot } from 'react-dom/client';
import { Router } from './router.tsx';
import './styles/app.css';

createRoot(document.getElementById('root')!).render(<Router />);
