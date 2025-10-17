import { functions } from '../../../firebase/config';

export async function blockUser(targetUid) {
  if (!targetUid) throw new Error('Missing targetUid');
  const callable = functions.httpsCallable('blockUser');
  await callable({ targetUid });
}

export async function unblockUser(targetUid) {
  if (!targetUid) throw new Error('Missing targetUid');
  const callable = functions.httpsCallable('unblockUser');
  await callable({ targetUid });
}
