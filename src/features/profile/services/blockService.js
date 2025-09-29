import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase/config';

export async function blockUser(targetUid) {
  if (!targetUid) throw new Error('Missing targetUid');
  const callable = httpsCallable(functions, 'blockUser');
  await callable({ targetUid });
}

export async function unblockUser(targetUid) {
  if (!targetUid) throw new Error('Missing targetUid');
  const callable = httpsCallable(functions, 'unblockUser');
  await callable({ targetUid });
}
