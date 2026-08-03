# API Documentation for HireSmart AI

## Overview
This document provides a comprehensive overview of the API endpoints available in the HireSmart AI application. The API follows RESTful principles and is designed to facilitate interactions with the Applicant Tracking System.

## Base URL
The base URL for all API requests is:
```
http://<your-domain>/api/v1
```

## Authentication
All endpoints require authentication. Use the following method to authenticate:

### Login
- **Endpoint:** `/auth/login`
- **Method:** POST
- **Request Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "yourpassword"
  }
  ```
- **Response:**
  - **200 OK:** Returns user details and a JWT token.
  - **401 Unauthorized:** Invalid credentials.

### Register
- **Endpoint:** `/auth/register`
- **Method:** POST
- **Request Body:**
  ```json
  {
    "name": "John Doe",
    "email": "user@example.com",
    "password": "yourpassword"
  }
  ```
- **Response:**
  - **201 Created:** Returns the created user details.
  - **400 Bad Request:** Validation errors.

## User Management
### Get User Profile
- **Endpoint:** `/users/me`
- **Method:** GET
- **Headers:** 
  - `Authorization: Bearer <token>`
- **Response:**
  - **200 OK:** Returns the authenticated user's profile.

### Update User Profile
- **Endpoint:** `/users/me`
- **Method:** PUT
- **Headers:** 
  - `Authorization: Bearer <token>`
- **Request Body:**
  ```json
  {
    "name": "John Doe",
    "email": "user@example.com"
  }
  ```
- **Response:**
  - **200 OK:** Returns the updated user profile.

## Job Management
### Create Job
- **Endpoint:** `/jobs`
- **Method:** POST
- **Headers:** 
  - `Authorization: Bearer <token>`
- **Request Body:**
  ```json
  {
    "title": "Software Engineer",
    "description": "Job description here",
    "companyId": "company_id"
  }
  ```
- **Response:**
  - **201 Created:** Returns the created job details.

### Get All Jobs
- **Endpoint:** `/jobs`
- **Method:** GET
- **Response:**
  - **200 OK:** Returns a list of all jobs.

## Candidate Management
### Submit Resume
- **Endpoint:** `/candidates/submit`
- **Method:** POST
- **Headers:** 
  - `Authorization: Bearer <token>`
- **Request Body:**
  ```json
  {
    "resume": "base64_encoded_resume",
    "jobId": "job_id"
  }
  ```
- **Response:**
  - **201 Created:** Returns the submission confirmation.

### Get Candidate Rankings
- **Endpoint:** `/candidates/rankings`
- **Method:** GET
- **Headers:** 
  - `Authorization: Bearer <token>`
- **Response:**
  - **200 OK:** Returns a list of candidates ranked for a specific job.

## Notifications
### Get Notifications
- **Endpoint:** `/notifications`
- **Method:** GET
- **Headers:** 
  - `Authorization: Bearer <token>`
- **Response:**
  - **200 OK:** Returns a list of notifications for the authenticated user.

## Error Handling
All responses will include a status code and a message. Common status codes include:
- **200 OK:** Successful request.
- **201 Created:** Resource successfully created.
- **400 Bad Request:** Validation errors or malformed request.
- **401 Unauthorized:** Authentication failed.
- **404 Not Found:** Resource not found.
- **500 Internal Server Error:** Unexpected server error.

## Conclusion
This API documentation provides a high-level overview of the available endpoints in the HireSmart AI application. For further details on specific endpoints, please refer to the individual endpoint documentation or the source code.