// Shared JSDoc typedefs for interest-based posts
// (Keeps data models consistent across components/services)

/**
 * @typedef {Object} InterestPostCreatorSnapshot
 * @property {string|null} displayName
 * @property {string|null} avatarUrl
 * @property {number|null} rating
 */

/**
 * @typedef {Object} InterestPost
 * @property {string} id
 * @property {string} creatorId
 * @property {InterestPostCreatorSnapshot} creatorSnapshot
 * @property {string} interestId
 * @property {string} content
 * @property {'image'|'video'|'none'} mediaType
 * @property {string|null} mediaUrl
 * @property {string|null} mediaThumbnailUrl
 * @property {string|null} mediaStoragePath
 * @property {number|null} mediaWidth
 * @property {number|null} mediaHeight
 * @property {FirebaseFirestore.Timestamp|Date} createdAt
 * @property {FirebaseFirestore.Timestamp|Date} updatedAt
 * @property {number} commentCount
 * @property {number} likeCount
 * @property {boolean} isDeleted
 */

/**
 * @typedef {Object} InterestPostComment
 * @property {string} id
 * @property {string} authorId
 * @property {InterestPostCreatorSnapshot} authorSnapshot
 * @property {string} body
 * @property {FirebaseFirestore.Timestamp|Date} createdAt
 * @property {FirebaseFirestore.Timestamp|Date} updatedAt
 * @property {boolean} deleted
 * @property {number} likeCount
 */

export {};
