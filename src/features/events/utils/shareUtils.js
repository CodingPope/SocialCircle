import { shareEvent } from '../../../services/shareService';

export async function shareEventDetails(event, context = {}) {
  return shareEvent(event, context);
}
