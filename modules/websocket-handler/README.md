# WebSocket Handler

This module handles WebSocket connections for the GitGazer system.

## Overview

The WebSocket handler manages:

- WebSocket connection establishment (`CONNECT` events)
- WebSocket disconnection cleanup (`DISCONNECT` events)
- JWT token validation for authentication
- Storage of connection records in DynamoDB

## Key Features

### Authentication

- JWT token validation using AWS Cognito
- Group-based authorization via `cognito:groups` claim
- Connection denied for users without valid groups

### Connection Management

- Stores connection records for each user's Cognito groups
- Automatic cleanup on disconnection
- Batch operations for efficient DynamoDB usage

## Technical Details

### Environment Variables

- `AWS_REGION`: AWS region for services
- `COGNITO_USER_POOL_ID`: Cognito User Pool ID for JWT validation
- `COGNITO_CLIENT_ID`: Cognito Client ID for JWT audience validation
- `TABLE_NAME`: DynamoDB table for connection storage
- `DYNAMODB_TABLE_CONNECTIONS_CONNECTION_ID_INDEX`: GSI name for connection ID queries

### Event Flow

#### CONNECT Event

1. Extract JWT token from query parameters (idToken)
2. Validate JWT token against Cognito
3. Extract user's Cognito groups
4. Store connection record for each group in DynamoDB
5. Return success/failure response

#### DISCONNECT Event

1. Query DynamoDB for all records with the connection ID
2. Batch delete all connection records
3. Return success response

### Authentication Mechanism

**Important Note**: `idToken` is passed as a query parameter in the WebSocket URL.

### Development

```bash
# Install dependencies
npm ci

# Run local development server
npm run dev

# Build for deployment
npm run build

# Package for Lambda deployment
npm run buildZip
```

The development server runs on port 8081 and provides test endpoints:

- `GET /connect?idToken=<jwt>` - Test connection
- `GET /disconnect` - Test disconnection

### Type Definitions

Key TypeScript interfaces:

- `JWTPayload`: JWT token structure
- `ConnectionRecord`: DynamoDB connection record structure
- `JWKSResponse`: Cognito JWKS response structure

### Error Handling

The handler provides specific error responses for:

- Missing authentication tokens (401)
- Invalid JWT tokens (401)
- Users without authorized groups (401)
- DynamoDB validation errors (400)
- Throttling errors (429)
- Resource not found errors (404)
- Generic service errors (500)
