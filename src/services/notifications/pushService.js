// Description: Backward-compatible re-export of the notifications push service.
// New code should import from 'src/features/notifications', but this keeps legacy
// paths working while we consolidate notification helpers in one module.
export * from '../../features/notifications/api/pushService';
