// Tab ile secim dongusunde ekrandaki arac cubugunun altinda gosterilen tur yazisi ("Type: Nodes")
import { create } from 'zustand';

export const selSig = (nodes: string[], edges: string[]) => [...nodes].sort().join(',') + '|' + [...edges].sort().join(',');

// sig: yazinin ait oldugu secim; secim baska bir sey olursa yazi kendiliginden kaybolur
export const useTabLabel = create<{ label: string; sig: string }>(() => ({ label: '', sig: '' }));
