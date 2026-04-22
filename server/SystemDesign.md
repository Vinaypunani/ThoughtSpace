<div align="center">

# ⬡ Community Blog Platform
### Backend System Design Document

![Stack](https://img.shields.io/badge/Express.js-4.x-000000?style=for-the-badge&logo=express)
![MongoDB](https://img.shields.io/badge/MongoDB-7.0-47A248?style=for-the-badge&logo=mongodb)
![Redis](https://img.shields.io/badge/Redis-7.0-DC382D?style=for-the-badge&logo=redis)
![Cloudinary](https://img.shields.io/badge/Cloudinary-Media-3448C5?style=for-the-badge&logo=cloudinary)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker)

> **Production-ready backend architecture for a community blog platform targeting 100K–1M users.**
> Written as a Vibe Coding reference for tools like **Cursor** and **Claude Code**.

| | |
|---|---|
| **Platform Type** | Community Blog (User-Generated Content) |
| **Scale** | 100,000 – 1,000,000 active users |
| **Auth** | JWT (Access + Refresh) + Google OAuth 2.0 |
| **Roles** | `author` · `admin` |
| **Media** | Cloudinary (images & video) |
| **Infra** | Docker + PM2 Cluster + Redis |

</div>

---

## 📋 Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [Folder Structure](#3-folder-structure)
4. [Database Design](#4-database-design-mongodb)
5. [REST API Reference](#5-rest-api-reference)
6. [Authentication & Security](#6-authentication--security)
7. [Redis — Caching & Rate Limiting](#7-redis--caching--rate-limiting)
8. [Media Uploads — Cloudinary](#8-media-uploads--cloudinary)
9. [Full-Text Search — Atlas Search](#9-full-text-search--atlas-search)
10. [Async Jobs — BullMQ](#10-async-jobs--bullmq)
11. [Analytics & View Counts](#11-analytics--view-counts)
12. [Environment Variables](#12-environment-variables)
13. [Docker & Deployment](#13-docker--deployment)
14. [Error Handling & Logging](#14-error-handling--logging)
15. [Scalability Checklist](#15-scalability-checklist)
16. [Implementation Roadmap](#16-implementation-roadmap)

---

## 1. Project Overview

### Design Goals

| Goal | Detail |
|------|--------|
| **High Availability** | 99.9% uptime across all API services |
| **Horizontal Scalability** | Stateless Express services, PM2 cluster mode |
| **Performance** | Sub-200ms p95 response for read-heavy endpoints via Redis |
| **Security** | JWT + OAuth 2.0, RBAC, Helmet, rate limiting |
| **Observability** | Structured JSON logging (Winston), request tracing (Morgan) |

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Runtime | Node.js 20 LTS | Non-blocking I/O, async workloads |
| Framework | Express.js 4.x | HTTP routing, middleware pipeline |
| Database | MongoDB 7 (Atlas) | Primary document store |
| ODM | Mongoose 8 | Schema validation, query builder |
| Cache / Sessions | Redis 7 (ioredis) | Response cache, rate limiting, sessions |
| Media Storage | Cloudinary | Image & video upload, transform, CDN |
| Auth | JWT + Passport.js | Stateless auth, OAuth 2.0 |
| Email / Queue | BullMQ + Redis | Async newsletter & notification jobs |
| Search | MongoDB Atlas Search | Full-text search via Lucene indexes |
| Containerisation | Docker + Docker Compose | Reproducible dev & prod environments |
| Process Manager | PM2 (inside container) | Cluster mode, zero-downtime reload |
| Reverse Proxy | Nginx | TLS termination, gzip, rate limiting |
| Monitoring | Winston + Morgan | Structured JSON logs, request logs |

---

## 2. System Architecture

### High-Level Request Flow

```
[Client Browser / Mobile App]
         │
         ▼
[Nginx — TLS · Rate Limit · Gzip]
         │
         ▼
[Express API — PM2 Cluster]  ◄──►  [Redis]  (cache · sessions · queues)
         │
    ┌────┴────┐
    ▼         ▼
[MongoDB]  [Cloudinary]
    │
    ▼
[BullMQ Workers]  ──►  [Email Provider — SendGrid / SES]
```

### Service Responsibilities

```
Nginx          →  TLS termination, gzip, upstream load balancing to Express replicas
Express API    →  Business logic, authentication, validation, response formatting
MongoDB Atlas  →  Primary data persistence, Atlas Search for full-text
Redis          →  L1 cache for reads, rate limit counters, refresh token store, job queues
Cloudinary     →  Media asset storage, transformation, CDN delivery
BullMQ         →  Async workers: email dispatch, analytics flush, media cleanup
```

---

## 3. Folder Structure

```
src/
├── config/
│   ├── db.js              # Mongoose connection
│   ├── redis.js           # ioredis client
│   ├── cloudinary.js      # Cloudinary SDK config
│   └── env.js             # Validated env vars (envalid / zod)
│
├── middlewares/
│   ├── authenticate.js    # Verify JWT, attach req.user
│   ├── authorize.js       # RBAC role gate
│   ├── validate.js        # Joi/Zod request schema validation
│   ├── rateLimiter.js     # Redis-backed sliding window limiter
│   └── upload.js          # Multer config (memory storage, size limits)
│
├── modules/
│   ├── auth/
│   │   ├── auth.routes.js
│   │   ├── auth.controller.js
│   │   ├── auth.service.js
│   │   └── strategies/    # passport-local, passport-google
│   ├── users/
│   │   ├── user.routes.js
│   │   ├── user.controller.js
│   │   ├── user.service.js
│   │   └── user.model.js
│   ├── posts/
│   │   ├── post.routes.js
│   │   ├── post.controller.js
│   │   ├── post.service.js
│   │   └── post.model.js
│   ├── comments/
│   ├── tags/
│   ├── media/
│   ├── search/
│   ├── analytics/
│   ├── newsletter/
│   └── admin/
│
├── jobs/
│   ├── queues.js          # BullMQ Queue definitions
│   ├── processors/
│   │   ├── email.processor.js
│   │   ├── analytics.processor.js
│   │   └── media.processor.js
│   └── scheduler.js       # Recurring job registration
│
├── utils/
│   ├── ApiError.js        # Operational error class
│   ├── asyncHandler.js    # try/catch wrapper for controllers
│   ├── logger.js          # Winston logger
│   ├── paginate.js        # Cursor-based pagination helper
│   └── cache.js           # Redis get/set/del helpers
│
├── validators/
│   ├── auth.validator.js
│   ├── post.validator.js
│   └── comment.validator.js
│
└── app.js                 # Express bootstrap, middleware chain, router mount
```

---

## 4. Database Design (MongoDB)

### Collections Overview

| Collection | Purpose | Est. Docs |
|-----------|---------|----------|
| `users` | Profiles, auth credentials, roles | 1M |
| `posts` | Blog posts with content, metadata, status | 5M |
| `comments` | Threaded comments tied to posts | 20M |
| `tags` | Tag/category taxonomy | 10K |
| `analytics` | Per-post view / read / like counters | 5M |
| `newsletters` | Subscriber list and campaign records | 500K |
| `media` | Cloudinary asset references per user | 3M |

---

### Schema Definitions

#### `users`
```js
// models/User.js
{
  _id:          ObjectId,
  username:     String,    // unique, lowercase, 3–30 chars
  email:        String,    // unique, indexed
  passwordHash: String,    // bcrypt — nullable for OAuth-only users
  role:         String,    // enum: ['author', 'admin']  default: 'author'

  profile: {
    displayName: String,
    bio:         String,   // max 500 chars
    avatarUrl:   String,   // Cloudinary URL
    website:     String,
    social: { twitter, linkedin, github },
  },

  oauth:         [{ provider, providerId, accessToken }],
  isVerified:    Boolean,  // default: false
  isActive:      Boolean,  // default: true
  newsletterSub: Boolean,  // default: false
  lastLoginAt:   Date,
  createdAt:     Date,
  updatedAt:     Date,
}
// Indexes: email (unique), username (unique), role, isActive
```

#### `posts`
```js
// models/Post.js
{
  _id:      ObjectId,
  slug:     String,    // unique, url-safe, auto-generated from title
  title:    String,    // max 200 chars
  excerpt:  String,    // max 500 chars
  content:  String,    // stored as sanitised HTML

  author:   ObjectId,  // ref: User — indexed
  tags:     [ObjectId],// ref: Tag  — max 10

  coverImage: { url, publicId, alt },

  status:   String,    // enum: ['draft', 'published', 'archived']
  featured: Boolean,   // default: false
  readTime: Number,    // computed, minutes

  seo: {
    metaTitle:       String,
    metaDescription: String,
    canonicalUrl:    String,
  },

  publishedAt: Date,
  createdAt:   Date,
  updatedAt:   Date,
}
// Indexes: slug (unique), author, tags, status, publishedAt (desc)
// Compound: { status: 1, publishedAt: -1 }
// Atlas Search Index on: title, excerpt, content, tags
```

#### `comments`
```js
// models/Comment.js
{
  _id:      ObjectId,
  post:     ObjectId,  // ref: Post — indexed
  author:   ObjectId,  // ref: User — indexed
  parentId: ObjectId,  // ref: Comment — null = top-level reply
  content:  String,    // max 2000 chars, sanitised HTML
  likes:    Number,    // default: 0
  isEdited: Boolean,
  isHidden: Boolean,   // soft-delete by admin
  createdAt: Date,
  updatedAt: Date,
}
// Indexes: post, author, parentId, createdAt
```

#### `analytics`
```js
// models/Analytics.js
{
  _id:           ObjectId,
  post:          ObjectId,  // ref: Post — unique
  views:         Number,    // total views
  uniqueViews:   Number,    // deduplicated (Redis SET)
  likes:         Number,
  readCompletes: Number,    // client beacon
  updatedAt:     Date,
}
// Always update with $inc — never overwrite
```

### Indexing Strategy

> ⚡ **Performance Rules**

- All FK fields (`author`, `post`, `tags[]`) **must** have indexes
- Compound index on posts: `{ status: 1, publishedAt: -1 }` for feed queries
- Replace text indexes with **Atlas Search Lucene** index for full-text
- `analytics` collection: use `$inc` atomic updates — never overwrite
- TTL index on OTP/session collections: `expireAfterSeconds: 900` (15 min)
- Paginate all list endpoints with **cursor-based pagination** (never `skip > 1000`)

---

## 5. REST API Reference

### Base URL & Response Envelope

```
Base URL:  /api/v1
```

**Success response:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Post created",
  "meta": { "page": 1, "limit": 20, "total": 340, "nextCursor": "abc123" }
}
```

**Error response:**
```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Post not found",
    "details": []
  }
}
```

---

### Auth — `/api/v1/auth`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/register` | Public | Register with email + password |
| `POST` | `/login` | Public | Login → `{ accessToken, refreshToken }` |
| `POST` | `/refresh` | Public | Rotate refresh token |
| `POST` | `/logout` | JWT | Invalidate refresh token in Redis |
| `GET` | `/google` | Public | OAuth 2.0 Google redirect |
| `GET` | `/google/callback` | Public | OAuth callback, issue tokens |
| `POST` | `/forgot-password` | Public | Send reset email via BullMQ |
| `POST` | `/reset-password` | Public | Validate OTP, update password |
| `POST` | `/verify-email` | Public | Verify email with token |

---

### Posts — `/api/v1/posts`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/` | Public | List published posts (cursor paginated) |
| `GET` | `/feed` | JWT | Personalised feed (followed tags) |
| `GET` | `/:slug` | Public | Single post + increment view count |
| `POST` | `/` | Author | Create draft post |
| `PATCH` | `/:id` | Author | Update own post |
| `DELETE` | `/:id` | Author | Soft-delete own post |
| `POST` | `/:id/publish` | Author | Change status to `published` |
| `POST` | `/:id/cover` | Author | Upload cover image to Cloudinary |
| `GET` | `/tag/:tagSlug` | Public | Posts by tag (paginated) |
| `GET` | `/author/:username` | Public | Posts by author |

---

### Comments — `/api/v1/comments`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/post/:postId` | Public | Threaded comments for a post |
| `POST` | `/post/:postId` | JWT | Add top-level comment |
| `POST` | `/:commentId/reply` | JWT | Reply to a comment |
| `PATCH` | `/:commentId` | Author | Edit own comment (marks `isEdited`) |
| `DELETE` | `/:commentId` | JWT | Soft-delete own comment or admin override |
| `POST` | `/:commentId/like` | JWT | Toggle like on comment |

---

### Search — `/api/v1/search`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/?q=&type=&tags=&author=&page=` | Public | Full-text search via Atlas Search. Filters: tag, author, date range |
| `GET` | `/suggestions?q=` | Public | Autocomplete suggestions (Redis cache, TTL 60s) |

---

### Analytics — `/api/v1/analytics`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/posts/:id` | Author / Admin | Views, reads, likes for a post |
| `GET` | `/dashboard` | Admin | Platform-wide stats summary |
| `GET` | `/top-posts` | Public | Trending posts (cached 10 min) |

---

### Media — `/api/v1/media`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/sign` | JWT | Get signed upload params for direct Cloudinary upload |
| `POST` | `/confirm` | JWT | Confirm upload, save Media doc to DB |
| `DELETE` | `/:publicId` | JWT | Delete asset from Cloudinary + DB |
| `GET` | `/` | JWT | List current user's media assets |

---

### Admin — `/api/v1/admin`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/users` | Admin | List all users with filters |
| `PATCH` | `/users/:id` | Admin | Update user (`role`, `isActive`, `isVerified`) |
| `DELETE` | `/users/:id` | Admin | Deactivate user |
| `GET` | `/posts` | Admin | All posts including drafts |
| `PATCH` | `/posts/:id/feature` | Admin | Toggle `featured` status |
| `DELETE` | `/posts/:id` | Admin | Hard-delete post |
| `PATCH` | `/comments/:id/hide` | Admin | Hide inappropriate comment |
| `GET` | `/tags` | Admin | List all tags |
| `POST` | `/tags` | Admin | Create tag |
| `DELETE` | `/tags/:id` | Admin | Delete tag |

---

## 6. Authentication & Security

### JWT Token Architecture

| Token | Type | TTL | Storage |
|-------|------|-----|---------|
| Access Token | JWT (HS256) | 15 minutes | Client memory (never localStorage) |
| Refresh Token | Opaque UUID | 7 days | Redis: `refresh:<userId>:<tokenId>` |

**Flow:**
```
Login  →  Issue accessToken (15m) + refreshToken (7d, stored in Redis)
       →  Client sends accessToken in Authorization: Bearer <token>

Refresh  →  POST /auth/refresh with refreshToken
         →  Old token deleted from Redis, new pair issued (rotation)

Logout  →  DELETE refresh token from Redis
        →  Add accessToken jti to Redis blacklist (TTL = remaining JWT TTL)
```

**OAuth (Google):**
```
GET /auth/google  →  Passport GoogleStrategy redirect
Callback          →  Upsert user (email match) → issue JWT pair
```

---

### Middleware Stack Order

```js
// app.js — apply in this EXACT order
app.use(helmet())                          // 1. Security headers
app.use(cors({ origin, credentials }))     // 2. CORS whitelist
app.use(express.json({ limit: '10kb' }))   // 3. Body parser with size cap
app.use(morgan('combined'))                // 4. Request logging
app.use(globalRateLimiter)                 // 5. 200 req / 15 min per IP
// Route-specific limiters:
router.use('/auth',   authRateLimiter)     // 6. 10 req / 15 min
router.use('/media',  uploadRateLimiter)   // 7. 30 req / hour
// Per-route middleware:
authenticate()                             // 8. Verify JWT → req.user
authorize(['admin'])                       // 9. RBAC role gate
validateRequest(schema)                    // 10. Joi/Zod validation
controller()                               // 11. Business logic
errorHandler()                             // 12. Global error handler (LAST)
```

---

### RBAC Matrix

| Action | Public | Author (own) | Author (other) | Admin |
|--------|--------|-------------|----------------|-------|
| Read published posts | ✅ | ✅ | ✅ | ✅ |
| Create post | ❌ | ✅ | ❌ | ✅ |
| Edit post | ❌ | ✅ | ❌ | ✅ |
| Delete post (soft) | ❌ | ✅ | ❌ | ✅ |
| Delete post (hard) | ❌ | ❌ | ❌ | ✅ |
| Comment | ❌ | ✅ | ✅ | ✅ |
| Hide comment | ❌ | ❌ | ❌ | ✅ |
| Upload media | ❌ | ✅ | ❌ | ✅ |
| View own analytics | ❌ | ✅ | ❌ | ✅ |
| View platform analytics | ❌ | ❌ | ❌ | ✅ |
| Manage users | ❌ | ❌ | ❌ | ✅ |
| Manage tags | ❌ | ❌ | ❌ | ✅ |
| Feature posts | ❌ | ❌ | ❌ | ✅ |

---

## 7. Redis — Caching & Rate Limiting

### Cache Key Patterns

| Key Pattern | TTL | Content |
|------------|-----|---------|
| `post:<slug>` | 5 min | Single post document |
| `posts:feed:page:<cursor>` | 2 min | Paginated post feed |
| `posts:tag:<slug>:page:<n>` | 3 min | Posts by tag |
| `posts:top` | 10 min | Trending posts list |
| `search:suggestions:<q>` | 60 sec | Autocomplete suggestions |
| `analytics:<postId>` | 30 sec | View/like counts |
| `user:profile:<username>` | 10 min | Public user profile |
| `tags:all` | 30 min | Full tag list |
| `newsletter:stats` | 15 min | Subscriber count |
| `rl:<ip>` | 15 min | Rate limit counter (sliding window) |
| `refresh:<userId>:<tid>` | 7 days | Refresh token store |
| `blacklist:<jti>` | 15 min | Logged-out access tokens |
| `post:counters:<postId>` | — | Redis HASH for view/like $incr |
| `view:dedup:<postId>` | 24 h | SET for unique viewer deduplication |

### Cache Invalidation Rules

> **Pattern: Cache-Aside (lazy population) for all read endpoints.**

```
On POST/PATCH/DELETE post  →  DEL post:<slug>
                           →  SCAN+DEL posts:feed:*
                           →  SCAN+DEL posts:tag:<slug>:*

On new comment             →  DEL post:<slug>  (comment count embedded in post)

On analytics update        →  DEL analytics:<postId>
                              (after Redis INCR, sync to Mongo every 60s via BullMQ)

On tag update              →  DEL tags:all
                           →  SCAN+DEL posts:tag:<slug>:*

On user profile update     →  DEL user:profile:<username>
```

> ⚠️ **Never use `KEYS *` in production.** Use `SCAN 0 MATCH <pattern> COUNT 100` with pipelined `DEL`.

---

## 8. Media Uploads — Cloudinary

### Signed Upload Flow

```
Step 1  →  Client calls POST /api/v1/media/sign
           Server returns: { signature, timestamp, apiKey, cloudName, folder }

Step 2  →  Client uploads DIRECTLY to Cloudinary using signed params
           (files never pass through your Express server)

Step 3  →  Client calls POST /api/v1/media/confirm with { publicId, url, resourceType }
           Server saves a Media doc linked to req.user

Step 4  →  For post cover, client sends publicId → PATCH /posts/:id/cover
           Server transforms URL: w_1200,h_630,c_fill,q_auto,f_auto
```

### Cloudinary Config

```js
// config/cloudinary.js
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true,
});

// Transformation presets
const TRANSFORMS = {
  cover:  'w_1200,h_630,c_fill,q_auto,f_auto',
  avatar: 'w_200,h_200,c_fill,g_face,r_max,q_auto,f_auto',
  thumb:  'w_400,h_250,c_fill,q_auto,f_auto',
};

// Folder structure
// blog/<userId>/posts
// blog/<userId>/avatars

// Allowed types: image/jpeg, image/png, image/webp, video/mp4
// Max size:      images 10MB · videos 100MB
```

---

## 9. Full-Text Search — Atlas Search

### Search Index Definition

```json
{
  "name": "posts_search_index",
  "definition": {
    "mappings": {
      "dynamic": false,
      "fields": {
        "title":   [
          { "type": "string", "analyzer": "lucene.english" },
          { "type": "autocomplete", "tokenization": "edgeGram" }
        ],
        "excerpt":     [{ "type": "string", "analyzer": "lucene.english" }],
        "content":     [{ "type": "string", "analyzer": "lucene.english" }],
        "tags":        [{ "type": "string" }],
        "status":      [{ "type": "token" }],
        "author":      [{ "type": "token" }],
        "publishedAt": [{ "type": "date" }]
      }
    }
  }
}
```

### Search Aggregation Pipeline

```js
// services/search.service.js
db.posts.aggregate([
  {
    $search: {
      index: 'posts_search_index',
      compound: {
        must: [
          { text: { query, path: ['title', 'excerpt', 'content'] } }
        ],
        filter: [
          { equals: { path: 'status', value: 'published' } },
          ...(tagId ? [{ equals: { path: 'tags', value: tagId } }] : []),
        ]
      }
    }
  },
  { $addFields: { score: { $meta: 'searchScore' } } },
  { $match: { score: { $gt: 0.5 } } },
  { $sort: { score: -1, publishedAt: -1 } },
  { $skip: page * limit },
  { $limit: limit },
  { $project: { title:1, slug:1, excerpt:1, author:1, coverImage:1, publishedAt:1, score:1 } }
]);
```

---

## 10. Async Jobs — BullMQ

### Queue Definitions

| Queue | Trigger | Processor | Retry |
|-------|---------|-----------|-------|
| `email:verify` | User registration | Send verification email | 3× exp backoff |
| `email:reset` | Forgot password | Send reset OTP email | 3× exp backoff |
| `email:newsletter` | Admin campaign trigger | Batch send to subscribers | 5× exp backoff |
| `email:welcome` | Email verified | Send welcome email | 2× exp backoff |
| `analytics:sync` | Redis counter threshold | Flush view counts to MongoDB | 3× exp backoff |
| `media:cleanup` | Post / user deleted | Delete Cloudinary assets | 3× exp backoff |
| `post:notify` | Post published | Notify subscribers via email | 3× exp backoff |

### BullMQ Setup

```js
// jobs/queues.js
const { Queue, Worker } = require('bullmq');
const redisConnection = { host: process.env.REDIS_HOST, port: 6379 };

export const emailQueue     = new Queue('email',     { connection: redisConnection });
export const analyticsQueue = new Queue('analytics', { connection: redisConnection });
export const mediaQueue     = new Queue('media',     { connection: redisConnection });

// Adding a job
emailQueue.add('verify', { userId, token }, {
  attempts:          3,
  backoff:           { type: 'exponential', delay: 2000 },
  removeOnComplete:  100,
  removeOnFail:      500,
});

// Worker
new Worker('email', async (job) => {
  if (job.name === 'verify') await sendVerificationEmail(job.data);
  if (job.name === 'newsletter') await sendNewsletterBatch(job.data);
}, { connection: redisConnection });
```

---

## 11. Analytics & View Counts

### Redis-First Counter Strategy

> **Problem:** Updating MongoDB on every page view at 100K+ users causes write contention.

```
Phase 1 (Realtime):
  HINCRBY post:counters:<postId> views 1

Phase 2 (Periodic — every 60 seconds via BullMQ):
  Read all dirty counters from Redis
  → Bulk $inc update to MongoDB analytics collection
  → Clear Redis counters after successful write

Deduplication:
  SADD view:dedup:<postId> <viewerId>   (TTL: 24h)
  Only increment if SADD returns 1 (new member = unique view)
```

**Metrics tracked:** `views` · `uniqueViews` · `likes` · `readCompletes` (client beacon)

---

## 12. Environment Variables

```bash
# .env.example — NEVER commit .env to git

# ── Server ──────────────────────────────────────────
NODE_ENV=production
PORT=5000
API_VERSION=v1

# ── MongoDB ─────────────────────────────────────────
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/blog?retryWrites=true

# ── Redis ───────────────────────────────────────────
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=<strong-password>

# ── JWT ─────────────────────────────────────────────
JWT_SECRET=<256-bit-random-secret>
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

# ── OAuth ───────────────────────────────────────────
GOOGLE_CLIENT_ID=<id>
GOOGLE_CLIENT_SECRET=<secret>
GOOGLE_CALLBACK_URL=https://api.yourdomain.com/api/v1/auth/google/callback

# ── Cloudinary ──────────────────────────────────────
CLOUDINARY_CLOUD_NAME=<name>
CLOUDINARY_API_KEY=<key>
CLOUDINARY_API_SECRET=<secret>

# ── Email ───────────────────────────────────────────
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=<key>
EMAIL_FROM=noreply@yourdomain.com

# ── App ─────────────────────────────────────────────
CLIENT_URL=https://yourdomain.com
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

---

## 13. Docker & Deployment

### Dockerfile

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY src/ ./src/

# PM2 process manager
RUN npm install -g pm2

EXPOSE 5000
CMD ["pm2-runtime", "ecosystem.config.js"]
```

### PM2 Ecosystem Config

```js
// ecosystem.config.js
module.exports = {
  apps: [{
    name:           'blog-api',
    script:         './src/app.js',
    exec_mode:      'cluster',
    instances:      'max',       // 1 instance per CPU core
    max_memory_restart: '500M',
    env_production: {
      NODE_ENV: 'production'
    },
    error_file: './logs/err.log',
    out_file:   './logs/out.log',
    merge_logs: true,
  }]
};
```

### docker-compose.yml

```yaml
version: "3.9"
services:

  api:
    build: .
    ports: ["5000:5000"]
    env_file: .env
    depends_on: [redis]
    restart: unless-stopped
    deploy:
      replicas: 2
      resources:
        limits: { cpus: "1.5", memory: 1G }
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/health"]
      interval: 30s
      retries: 3

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes: [redis_data:/data]
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./nginx/ssl:/etc/nginx/ssl
    depends_on: [api]
    restart: unless-stopped

volumes:
  redis_data:
```

---

## 14. Error Handling & Logging

### ApiError Class

```js
// utils/ApiError.js
class ApiError extends Error {
  constructor(statusCode, message, code, details = []) {
    super(message);
    this.statusCode    = statusCode;
    this.code          = code;
    this.details       = details;
    this.isOperational = true;
  }
}

// Factories
ApiError.badRequest   = (msg, details) => new ApiError(400, msg, 'BAD_REQUEST', details);
ApiError.unauthorized = (msg = 'Unauthorized') => new ApiError(401, msg, 'UNAUTHORIZED');
ApiError.forbidden    = (msg = 'Forbidden') => new ApiError(403, msg, 'FORBIDDEN');
ApiError.notFound     = (msg) => new ApiError(404, msg, 'NOT_FOUND');
ApiError.conflict     = (msg) => new ApiError(409, msg, 'CONFLICT');
ApiError.tooMany      = (msg) => new ApiError(429, msg, 'TOO_MANY_REQUESTS');
ApiError.internal     = (msg) => new ApiError(500, msg, 'INTERNAL_SERVER_ERROR');
```

### HTTP Error Code Reference

| Code | Status | When to Use |
|------|--------|-------------|
| `BAD_REQUEST` | 400 | Validation failure — return Joi/Zod `details` array |
| `UNAUTHORIZED` | 401 | Missing or invalid JWT / OAuth token |
| `FORBIDDEN` | 403 | Valid token but insufficient role |
| `NOT_FOUND` | 404 | Resource (post/user/comment) does not exist |
| `CONFLICT` | 409 | Duplicate email, username, or slug |
| `TOO_MANY_REQUESTS` | 429 | Rate limit exceeded — include `Retry-After` header |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected errors — log full stack, return generic message |

### asyncHandler Wrapper

```js
// utils/asyncHandler.js
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Usage in controller
router.get('/:slug', asyncHandler(async (req, res) => {
  const post = await PostService.getBySlug(req.params.slug);
  if (!post) throw ApiError.notFound('Post not found');
  res.json({ success: true, data: post });
}));
```

---

## 15. Scalability Checklist

### Before Going Live

- [ ] Enable MongoDB connection pooling: `maxPoolSize: 50` in Mongoose options
- [ ] Enable MongoDB Atlas auto-scaling (M30+ tier for 100K users)
- [ ] Add compound indexes for all frequently queried fields (see §4)
- [ ] Configure Redis `maxmemory-policy = allkeys-lru`
- [ ] Set Nginx `worker_processes auto; worker_connections 2048;`
- [ ] Enable HTTP/2 and gzip in Nginx config
- [ ] CORS whitelist only production client URLs
- [ ] Cookies: `secure`, `httpOnly`, `sameSite=strict`
- [ ] Enable CSP, HSTS, `X-Frame-Options` via Helmet
- [ ] All secrets in environment variables — zero secrets in code
- [ ] PM2 cluster mode with `instances: "max"`
- [ ] Docker health checks on all services
- [ ] MongoDB Atlas alerts for CPU > 70%, connections > 80%
- [ ] Redis persistence: AOF + RDB snapshots enabled
- [ ] All List endpoints use cursor-based pagination (no `skip > 1000`)
- [ ] BullMQ jobs have retry + dead-letter queue configured
- [ ] Cloudinary upload size limits enforced server-side before signing
- [ ] Winston logging to file + stdout in structured JSON format
- [ ] API versioning in URL `/api/v1` for future migrations
- [ ] Graceful shutdown: drain connections on `SIGTERM`

---

## 16. Implementation Roadmap

| Phase | Tasks | Priority |
|-------|-------|----------|
| **Phase 1** — Foundation | Project scaffold, Docker Compose, MongoDB + Redis connect, ENV config, logger, error handler, asyncHandler | `P0` |
| **Phase 2** — Auth | User model, register/login/refresh/logout, JWT middleware, Google OAuth, email verification via BullMQ | `P0` |
| **Phase 3** — Core API | Posts CRUD (draft/publish), Comments (threaded), Tags, RBAC middleware, Joi validators | `P0` |
| **Phase 4** — Media | Cloudinary signed upload flow, media model, post cover image, avatar upload, cleanup job | `P1` |
| **Phase 5** — Search | Atlas Search index, search endpoint, autocomplete with Redis cache | `P1` |
| **Phase 6** — Analytics | Redis counter + BullMQ sync job, view dedup, top posts cache, author analytics API | `P1` |
| **Phase 7** — Newsletter | Subscribe/unsubscribe, campaign trigger, batch BullMQ email worker | `P2` |
| **Phase 8** — Admin API | User management, post moderation, comment hiding, tag management, dashboard stats | `P2` |
| **Phase 9** — Hardening | Full rate limiting, security headers, PM2 cluster, Nginx config, health check endpoint `/health` | `P0` |

---

<div align="center">

**Community Blog Platform — Backend System Design**
`Express.js` · `MongoDB` · `Redis` · `Cloudinary` · `Docker`

*Written for Cursor / Claude Code — each section maps 1:1 to implementation tasks.*

</div>
