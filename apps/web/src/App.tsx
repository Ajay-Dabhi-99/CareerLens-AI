import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@/features/auth';
import { AppRouter } from '@/app/router';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </BrowserRouter>
  );
}
