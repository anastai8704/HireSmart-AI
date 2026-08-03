# HireSmart AI

## Overview
HireSmart AI is an AI-powered Applicant Tracking System designed to streamline the recruitment process for companies. This application leverages advanced AI capabilities to enhance candidate management, job matching, and recruitment analytics.

## Features
- **AI-Powered Resume Parsing**: Automatically extract and analyze candidate information from resumes.
- **Job-Resume Matching**: Match candidates to job postings based on their qualifications and experiences.
- **Candidate Ranking**: Rank candidates based on their fit for specific job roles.
- **Interview Scheduling**: Simplify the process of scheduling interviews between candidates and recruiters.
- **Real-Time Notifications**: Use Socket.io for real-time updates and notifications.
- **Admin Panel**: Manage users, roles, and permissions effectively.
- **Analytics Dashboard**: Gain insights into recruitment metrics and performance.
- **Background Jobs**: Utilize BullMQ for processing background tasks efficiently.
- **Cloud Storage**: Store resumes and other documents using Cloudinary or AWS S3.
- **Email Verification**: Ensure user authenticity through email verification.
- **Password Management**: Implement forgot/reset password functionality.
- **Audit Logs**: Keep track of changes and actions within the application.

## Getting Started

### Prerequisites
- Node.js (version 14 or higher)
- MongoDB Atlas account
- Docker (for containerization)
- Redis (for caching)

### Installation
1. Clone the repository:
   ```
   git clone https://github.com/yourusername/hire-smart-ai.git
   cd hire-smart-ai
   ```

2. Set up environment variables:
   - Copy `.env.example` to `.env` in both the `backend` and `frontend` directories and fill in the required values.

3. Install backend dependencies:
   ```
   cd backend
   npm install
   ```

4. Install frontend dependencies:
   ```
   cd ../frontend
   npm install
   ```

### Running the Application
- **Backend**:
   ```
   cd backend
   npm run dev
   ```

- **Frontend**:
   ```
   cd frontend
   npm run dev
   ```

### Docker
To run the application using Docker, use the following command:
```
docker-compose up --build
```

### CI/CD
The project is set up with GitHub Actions for continuous integration. Ensure your workflows are configured correctly in the `.github/workflows/ci.yml` file.

## API Documentation
Comprehensive API documentation can be found in the `backend/docs/api.md` file.

## Testing
Unit and integration tests are located in the `backend/tests` directory. To run tests, use:
```
cd backend
npm test
```

## Contributing
Contributions are welcome! Please open an issue or submit a pull request for any enhancements or bug fixes.

## License
This project is licensed under the MIT License. See the LICENSE file for details.