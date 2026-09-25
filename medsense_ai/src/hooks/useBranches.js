import { useContext } from 'react';
import { BranchContext } from '../contexts/BranchContext';

export function useBranches() {
  const context = useContext(BranchContext);
  if (!context) {
    throw new Error('useBranches must be used within a BranchProvider');
  }
  return context;
}
