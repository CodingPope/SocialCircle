import { shareEvent } from '../../../services/share';

export async function shareEventDetails(event, context = {}) {
  return shareEvent(event, context);
}
