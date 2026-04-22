/**
 * Cursor-based pagination helper
 * @param {Model} model - Mongoose model
 * @param {Object} query - Mongoose query object
 * @param {Object} sort - Sort object e.g. { createdAt: -1 }
 * @param {Number} limit - Number of items to return
 * @param {String} cursor - Encoded cursor string
 * @returns {Object} { data, nextCursor, hasMore }
 */
const paginate = async (model, query = {}, sort = { _id: -1 }, limit = 10, cursor = null) => {
  let finalQuery = { ...query };
  const sortField = Object.keys(sort)[0] || '_id';
  const sortDirection = sort[sortField] === -1 || sort[sortField] === 'desc' ? -1 : 1;

  if (cursor) {
    const decodedCursor = Buffer.from(cursor, 'base64').toString('ascii');
    const operator = sortDirection === -1 ? '$lt' : '$gt';
    
    if (sortField === '_id') {
      finalQuery._id = { [operator]: decodedCursor };
    } else {
      // Basic fallback handling if sorting by another field. 
      // Assumes simple _id based cursor for this implementation
      finalQuery._id = { [operator]: decodedCursor }; 
    }
  }

  // Fetch limit + 1 to check if there are more items
  const data = await model.find(finalQuery)
    .sort(sort)
    .limit(limit + 1)
    .lean();

  const hasMore = data.length > limit;
  const results = hasMore ? data.slice(0, limit) : data;

  let nextCursor = null;
  if (results.length > 0 && hasMore) {
    const lastItem = results[results.length - 1];
    nextCursor = Buffer.from(lastItem._id.toString()).toString('base64');
  }

  return {
    data: results,
    nextCursor,
    hasMore
  };
};

module.exports = paginate;
