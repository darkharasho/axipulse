import { useState } from 'react';
import { AppLayout } from './app/AppLayout';

export type View = 'pulse' | 'timeline' | 'history' | 'settings';

function App() {
    const [view, setView] = useState<View>('pulse');

    return (
        <AppLayout view={view} setView={setView} />
    );
}

export default App;
