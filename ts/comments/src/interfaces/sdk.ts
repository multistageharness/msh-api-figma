/**
 * project: figma-comments
 * purpose: High-level SDK facade for Figma Comments operations
 * use-cases:
 *  - Simplified API for common comment operations
 *  - Convenient methods for comment management
 *  - Developer-friendly interface with sensible defaults
 *  - Comment reaction management and analytics
 * performance:
 *  - Optimized method composition
 *  - Efficient data processing
 *  - Smart caching strategies
 */

import FigmaCommentsService from '../core/service.js';

/**
 * High-level SDK for Figma Comments API
 *
 * @example
 * import { FigmaApiClient } from '@figma-api/fetch';
 * import { FigmaCommentsSDK } from 'figma-comments';
 *
 * const fetcher = new FigmaApiClient({ apiToken: process.env.FIGMA_TOKEN });
 * const sdk = new FigmaCommentsSDK({ fetcher });
 */
export class FigmaCommentsSDK {
  service: FigmaCommentsService;
  logger: any;

  /**
   * @param {Object} config - SDK configuration
   * @param {Object} config.fetcher - FigmaApiClient instance (required)
   * @param {Object} [config.logger=console] - Logger instance
   */
  constructor({ fetcher, logger = console }: { fetcher?: any; logger?: any } = {}) {
    this.service = new FigmaCommentsService({ fetcher, logger });
    this.logger = logger;
  }

  // Core comment operations

  /**
   * Get all comments in a file
   * @param {string} fileKey - Figma file key
   * @param {Object} options - Request options
   * @returns {Promise<Array>} Array of comments
   */
  async getComments(fileKey: string, options: Record<string, any> = {}): Promise<any[]> {
    return this.service.getFileComments(fileKey, options);
  }

  /**
   * Add a comment to a file
   * @param {string} fileKey - Figma file key
   * @param {string} message - Comment message
   * @param {Object} options - Comment options
   * @returns {Promise<Object>} Created comment
   */
  async addComment(fileKey: string, message: string, options: Record<string, any> = {}): Promise<any> {
    const commentData = { message, ...options };
    return this.service.addComment(fileKey, commentData);
  }

  /**
   * Delete a comment
   * @param {string} fileKey - Figma file key
   * @param {string} commentId - Comment ID
   * @returns {Promise<Object>} Deletion result
   */
  async deleteComment(fileKey: string, commentId: string): Promise<any> {
    return this.service.deleteComment(fileKey, commentId);
  }

  /**
   * Reply to a comment
   * @param {string} fileKey - Figma file key
   * @param {string} commentId - Parent comment ID
   * @param {string} message - Reply message
   * @returns {Promise<Object>} Created reply
   */
  async replyToComment(fileKey: string, commentId: string, message: string): Promise<any> {
    return this.service.replyToComment(fileKey, commentId, message);
  }

  // === REACTION METHODS ===

  /**
   * Get reactions for a specific comment
   * @param {string} fileKey - Figma file key
   * @param {string} commentId - Comment ID
   * @returns {Promise<Object>} Comment reactions
   */
  async getCommentReactions(fileKey: string, commentId: string): Promise<any> {
    return this.service.getCommentReactions(fileKey, commentId);
  }

  /**
   * Add a reaction to a comment
   * @param {string} fileKey - Figma file key
   * @param {string} commentId - Comment ID
   * @param {string} emoji - Reaction emoji (e.g., '👍', '❤️', '😀')
   * @returns {Promise<Object>} Added reaction
   */
  async addReaction(fileKey: string, commentId: string, emoji: string): Promise<any> {
    return this.service.addCommentReaction(fileKey, commentId, emoji);
  }

  /**
   * Remove a reaction from a comment
   * @param {string} fileKey - Figma file key
   * @param {string} commentId - Comment ID
   * @param {string} emoji - Reaction emoji to remove
   * @returns {Promise<Object>} Removal result
   */
  async removeReaction(fileKey: string, commentId: string, emoji: string): Promise<any> {
    return this.service.deleteCommentReaction(fileKey, commentId, emoji);
  }

  /**
   * Toggle a reaction on a comment (add if not present, remove if present)
   * @param {string} fileKey - Figma file key
   * @param {string} commentId - Comment ID
   * @param {string} emoji - Reaction emoji
   * @returns {Promise<Object>} Toggle result with action taken
   */
  async toggleReaction(fileKey: string, commentId: string, emoji: string): Promise<any> {
    return this.service.toggleCommentReaction(fileKey, commentId, emoji);
  }

  /**
   * Get comprehensive reaction summary for a file
   * @param {string} fileKey - Figma file key
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Reaction analytics
   */
  async getReactionSummary(fileKey: string, options: Record<string, any> = {}): Promise<any> {
    return this.service.getFileReactionSummary(fileKey, options);
  }

  /**
   * Get most popular reactions in a file
   * @param {string} fileKey - Figma file key
   * @param {number} limit - Number of top reactions to return
   * @returns {Promise<Array>} Top reactions with counts
   */
  async getTopReactions(fileKey: string, limit = 10): Promise<any[]> {
    const summary = await this.getReactionSummary(fileKey, { topCount: limit });
    return summary.topEmojis;
  }

  /**
   * Get comments with the most reactions
   * @param {string} fileKey - Figma file key
   * @param {number} limit - Number of top comments to return
   * @returns {Promise<Array>} Most reacted comments
   */
  async getMostReactedComments(fileKey: string, limit = 10): Promise<any[]> {
    const summary = await this.getReactionSummary(fileKey, { topCount: limit });
    return summary.mostReactedComments;
  }

  /**
   * Convenience method to quickly add common reactions
   * @param {string} fileKey - Figma file key
   * @param {string} commentId - Comment ID
   * @param {string} type - Reaction type ('like', 'love', 'laugh', 'wow', 'sad', 'angry')
   * @returns {Promise<Object>} Added reaction
   */
  async quickReact(fileKey: string, commentId: string, type: string): Promise<any> {
    const emojiMap: Record<string, string> = {
      'like': '👍',
      'dislike': '👎',
      'love': '❤️',
      'laugh': '😂',
      'wow': '😮',
      'sad': '😢',
      'angry': '😠',
      'celebrate': '🎉',
      'fire': '🔥',
      'rocket': '🚀'
    };

    const emoji = emojiMap[type.toLowerCase()];
    if (!emoji) {
      throw new Error(`Unsupported reaction type: ${type}. Available: ${Object.keys(emojiMap).join(', ')}`);
    }

    return this.addReaction(fileKey, commentId, emoji);
  }

  // Enhanced comment operations

  /**
   * Add a comment at specific coordinates
   * @param {string} fileKey - Figma file key
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {string} message - Comment message
   * @returns {Promise<Object>} Created comment
   */
  async addCommentAtCoordinates(fileKey: string, x: number, y: number, message: string): Promise<any> {
    return this.addComment(fileKey, message, {
      position: { x, y }
    });
  }

  /**
   * Add a comment to a specific node
   * @param {string} fileKey - Figma file key
   * @param {string} nodeId - Node ID
   * @param {string} message - Comment message
   * @param {Object} offset - Node offset coordinates
   * @returns {Promise<Object>} Created comment
   */
  async addCommentToNode(fileKey: string, nodeId: string, message: string, offset: { x: number; y: number } = { x: 0, y: 0 }): Promise<any> {
    return this.addComment(fileKey, message, {
      position: { nodeId, offsetX: offset.x, offsetY: offset.y }
    });
  }

  /**
   * Get comment thread with all replies
   * @param {string} fileKey - Figma file key
   * @param {string} commentId - Root comment ID
   * @returns {Promise<Object>} Comment thread
   */
  async getCommentThread(fileKey: string, commentId: string): Promise<any> {
    return this.service.getCommentThread(fileKey, commentId);
  }

  /**
   * Search comments by content
   * @param {string} fileKey - Figma file key
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Matching comments
   */
  async searchComments(fileKey: string, query: string, options: Record<string, any> = {}): Promise<any[]> {
    return this.service.searchComments(fileKey, query, options);
  }

  /**
   * Get comments by user
   * @param {string} fileKey - Figma file key
   * @param {string} userId - User ID
   * @returns {Promise<Array>} User's comments
   */
  async getCommentsByUser(fileKey: string, userId: string): Promise<any[]> {
    return this.service.getCommentsByUser(fileKey, userId);
  }

  /**
   * Get unresolved comments
   * @param {string} fileKey - Figma file key
   * @returns {Promise<Array>} Unresolved comments
   */
  async getUnresolvedComments(fileKey: string): Promise<any[]> {
    return this.service.getUnresolvedComments(fileKey);
  }

  /**
   * Get comment statistics
   * @param {string} fileKey - Figma file key
   * @returns {Promise<Object>} Comment statistics
   */
  async getCommentStatistics(fileKey: string): Promise<any> {
    return this.service.getCommentStatistics(fileKey);
  }

  // Bulk operations

  /**
   * Export comments in specified format
   * @param {string} fileKey - Figma file key
   * @param {string} format - Export format (json, csv, markdown)
   * @returns {Promise<string>} Exported data
   */
  async exportComments(fileKey: string, format = 'json'): Promise<string> {
    return this.service.exportComments(fileKey, format);
  }

  /**
   * Add multiple comments at once
   * @param {string} fileKey - Figma file key
   * @param {Array} comments - Array of comment data
   * @returns {Promise<Object>} Bulk creation results
   */
  async bulkAddComments(fileKey: string, comments: Record<string, any>[]): Promise<any> {
    return this.service.bulkAddComments(fileKey, comments);
  }

  /**
   * Delete multiple comments
   * @param {string} fileKey - Figma file key
   * @param {Array<string>} commentIds - Array of comment IDs
   * @returns {Promise<Object>} Batch deletion results
   */
  async bulkDeleteComments(fileKey: string, commentIds: string[]): Promise<any> {
    return this.service.batchDeleteComments(fileKey, commentIds);
  }

  /**
   * Get recent comments from last N days
   * @param {string} fileKey - Figma file key
   * @param {number} days - Number of days to look back
   * @returns {Promise<Array>} Recent comments
   */
  async getRecentComments(fileKey: string, days = 7): Promise<any[]> {
    return this.service.getCommentHistory(fileKey, days);
  }

  // Convenience methods

  /**
   * Get all comments grouped by thread
   * @param {string} fileKey - Figma file key
   * @returns {Promise<Array>} Comments grouped by thread
   */
  async getCommentsGroupedByThread(fileKey: string): Promise<any[]> {
    const comments = await this.getComments(fileKey);
    const threads: any[] = [];

    // Get root comments (comments without parent_id)
    const rootComments = comments.filter((c: any) => !c.parent_id);

    for (const rootComment of rootComments) {
      const replies = comments.filter((c: any) => c.parent_id === rootComment.id);
      threads.push({
        ...rootComment,
        replies: replies.sort((a: any, b: any) => (new Date(a.created_at) as any) - (new Date(b.created_at) as any))
      });
    }

    return threads.sort((a: any, b: any) => (new Date(b.created_at) as any) - (new Date(a.created_at) as any));
  }

  /**
   * Get comment activity summary
   * @param {string} fileKey - Figma file key
   * @param {number} days - Number of days to analyze
   * @returns {Promise<Object>} Activity summary
   */
  async getCommentActivity(fileKey: string, days = 30): Promise<any> {
    const comments = await this.getRecentComments(fileKey, days);
    const activity: Record<string, any> = {};

    for (const comment of comments) {
      const date = comment.created_at.split('T')[0]; // Get date part
      if (!activity[date]) {
        activity[date] = {
          comments: 0,
          users: new Set(),
          messages: []
        };
      }

      activity[date].comments++;
      activity[date].users.add(comment.user.id);
      activity[date].messages.push({
        user: comment.user.handle,
        message: comment.message.substring(0, 100) + (comment.message.length > 100 ? '...' : '')
      });
    }

    // Convert Sets to counts
    Object.keys(activity).forEach(date => {
      activity[date].uniqueUsers = activity[date].users.size;
      delete activity[date].users;
    });

    return activity;
  }

  /**
   * Find comments containing mentions
   * @param {string} fileKey - Figma file key
   * @param {string} userId - User ID to find mentions for
   * @returns {Promise<Array>} Comments mentioning the user
   */
  async findMentions(fileKey: string, userId: string | null = null): Promise<any[]> {
    const comments = await this.getComments(fileKey);

    if (userId) {
      return comments.filter((c: any) =>
        c.message.includes(`@${userId}`) ||
        c.message.includes(`<@${userId}>`)
      );
    }

    // Find all mentions
    return comments.filter((c: any) =>
      c.message.includes('@') ||
      c.message.includes('<@')
    );
  }

  /**
   * Get comment engagement metrics including reactions
   * @param {string} fileKey - Figma file key
   * @returns {Promise<Object>} Enhanced engagement metrics
   */
  async getEngagementMetrics(fileKey: string): Promise<any> {
    const comments = await this.getComments(fileKey);
    const stats = await this.getCommentStatistics(fileKey);
    const reactionSummary = await this.getReactionSummary(fileKey);

    const engagementMetrics = {
      totalComments: stats.total,
      totalReplies: stats.totalReplies,
      threadsWithReplies: stats.withReplies,
      avgRepliesPerThread: stats.withReplies > 0 ? stats.totalReplies / stats.withReplies : 0,
      responseRate: stats.rootComments > 0 ? (stats.withReplies / stats.rootComments) * 100 : 0,
      mostActiveUser: this._findMostActiveUser(comments),
      longestThread: this._findLongestThread(comments),
      avgMessageLength: stats.averageLength,

      // Enhanced reaction metrics
      totalReactions: reactionSummary.totalReactions || 0,
      reactionRate: stats.total > 0 ? ((reactionSummary.totalReactions || 0) / stats.total) * 100 : 0,
      topReactions: reactionSummary.topEmojis || [],
      mostReactedComments: reactionSummary.mostReactedComments || [],
      reactionEngagementUsers: reactionSummary.userReactionActivity ? Object.keys(reactionSummary.userReactionActivity).length : 0,
      avgReactionsPerComment: stats.total > 0 ? (reactionSummary.totalReactions || 0) / stats.total : 0
    };

    return engagementMetrics;
  }

  /**
   * Archive old resolved comments (simulated)
   * @param {string} fileKey - Figma file key
   * @returns {Promise<Object>} Archive results
   */
  async archiveOldComments(fileKey: string): Promise<any> {
    return this.service.archiveResolvedComments(fileKey);
  }

  // Health and monitoring

  /**
   * Check API health
   * @returns {Promise<Object>} Health status
   */
  async healthCheck(): Promise<any> {
    // Simple health check - try to make a request to /v1/me endpoint
    try {
      await this.service.fetcher.request('/v1/me');
      return { status: 'healthy', message: 'API is responding normally' };
    } catch (error: any) {
      return { status: 'unhealthy', error: error.message };
    }
  }

  /**
   * Get client statistics
   * @returns {Object} Client statistics
   */
  getStats(): any {
    // Return statistics from the fetcher if available
    return this.service.fetcher.getStats ? this.service.fetcher.getStats() : {};
  }

  /**
   * Reset client cache and statistics
   */
  reset(): void {
    // Reset cache if available
    if (this.service.fetcher.reset) {
      this.service.fetcher.reset();
    }
  }

  // Private helper methods

  _findMostActiveUser(comments: any[]): any {
    const userCounts: Record<string, any> = {};

    for (const comment of comments) {
      if (!comment.user) continue;
      const userId = comment.user.id;
      if (!userCounts[userId]) {
        userCounts[userId] = {
          count: 0,
          user: comment.user
        };
      }
      userCounts[userId].count++;
    }

    const mostActive = Object.values(userCounts)
      .sort((a: any, b: any) => b.count - a.count)[0];

    return mostActive || null;
  }

  _findLongestThread(comments: any[]): any {
    const threads: Record<string, any[]> = {};

    // Group replies by parent
    for (const comment of comments) {
      if (comment.parent_id) {
        if (!threads[comment.parent_id]) {
          threads[comment.parent_id] = [];
        }
        threads[comment.parent_id].push(comment);
      }
    }

    let longestThread: any = null;
    let maxReplies = 0;

    for (const [parentId, replies] of Object.entries(threads)) {
      if (replies.length > maxReplies) {
        maxReplies = replies.length;
        const parentComment = comments.find((c: any) => c.id === parentId);
        longestThread = {
          parentComment,
          replyCount: replies.length
        };
      }
    }

    return longestThread;
  }
}

export default FigmaCommentsSDK;
