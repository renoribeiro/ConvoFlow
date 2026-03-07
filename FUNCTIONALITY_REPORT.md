# ConvoFlow Functionality Report

## 1. Introduction

This report provides a comprehensive overview of the ConvoFlow application's functionality, based on a detailed analysis of its source code. ConvoFlow is a powerful marketing automation platform designed to integrate with WhatsApp through the Evolution API. It provides a rich set of features for lead tracking, campaign management, reporting, and automation, all built on a modern technology stack that includes Vite, React, Supabase, and TypeScript.

## 2. High-Level Architecture

ConvoFlow is a full-stack application with a clear separation of concerns between the frontend, backend, and database.

*   **Frontend**: The frontend is a single-page application (SPA) built with Vite and React. It uses Tailwind CSS for styling and a variety of libraries for UI components, state management, and data fetching.
*   **Backend**: The backend is composed of a set of serverless functions deployed on Supabase. These functions handle business logic, data processing, and integration with external services like the Evolution API and Stripe.
*   **Database**: The database is a PostgreSQL instance managed by Supabase. The database schema is well-designed and includes tables for tracking, reporting, monitoring, and other application-critical data.

## 3. Frontend Analysis

The frontend of ConvoFlow is a modern and responsive user interface that provides a rich set of features for managing marketing campaigns and automations.

### 3.1. Technology Stack

*   **Framework**: React (SPA)
*   **Build Tool**: Vite
*   **Routing**: React Router Dom
*   **Language**: TypeScript
*   **Styling**: Tailwind CSS
*   **UI Components**: Shadcn UI, Radix UI
*   **State Management**: Zustand
*   **Data Fetching**: TanStack Query
*   **Forms**: React Hook Form
*   **Validation**: Zod

### 3.2. Key Features

*   **Dashboard**: The dashboard provides a high-level overview of key metrics, including lead tracking, campaign performance, and system status.
*   **Lead Tracking**: The application includes a comprehensive system for tracking leads from various sources, including UTM parameters.
*   **Campaign Management**: Users can create and manage marketing campaigns, including setting up automation flows and message templates.
*   **Reporting**: The application provides a flexible reporting engine that allows users to create custom reports and dashboards.
*   **Automation**: ConvoFlow includes a powerful automation engine that allows users to create complex automation flows based on a variety of triggers and actions.
*   **Settings**: The settings section allows users to configure their account, manage users, and connect to external services.

## 4. Backend Analysis

The backend of ConvoFlow is built on a serverless architecture using Supabase Functions. This provides a scalable and cost-effective solution for handling backend logic and data processing.

### 4.1. Technology Stack

*   **Platform**: Supabase Functions
*   **Runtime**: Deno
*   **Language**: TypeScript
*   **Database**: Supabase (PostgreSQL)

### 4.2. Key Functions

*   **`evolution-webhook`**: This function is the primary endpoint for receiving webhooks from the Evolution API. It processes incoming messages, connection status updates, and other events, and then triggers the appropriate actions in the application.
*   **`automation-processor`**: This function is responsible for executing automation flows. It is triggered by events in the application, such as a new lead being created or a message being received, and then executes the steps in the corresponding automation flow.
*   **`job-worker`**: This function is a general-purpose worker that can be used to execute a variety of background jobs, such as sending emails, processing reports, and cleaning up old data.

## 5. Database Analysis

The database is a critical component of the ConvoFlow application, and it is clear that a great deal of thought has gone into its design. The database schema is well-organized and includes a comprehensive set of tables for managing all aspects of the application.

### 5.1. Key Tables

*   **`traffic_sources`**: This table stores information about the sources of traffic to the application, including UTM parameters.
*   **`lead_tracking`**: This table tracks leads as they move through the sales funnel.
*   **`report_templates`**: This table stores templates for custom reports.
*   **`automation_flows`**: This table stores the definitions of automation flows.
*   **`webhook_logs`**: This table logs all incoming webhooks from the Evolution API.

### 5.2. Security

The database is secured using a combination of Row Level Security (RLS) and JWT verification. RLS is used to ensure that users can only access data that they are authorized to see, and JWT verification is used to ensure that only authenticated users can access the database.

## 6. Scripts and Automation

The `scripts` directory contains a set of scripts for automating various aspects of the development and deployment process.

*   **`deploy-evolution.js`**: This script automates the deployment of the Evolution API to a Portainer instance.
*   **`security-check.cjs`**: This script is a security scanner that checks for common vulnerabilities and misconfigurations.
*   **`setup-security.cjs`**: This script automates the setup of security-related files and configurations.

## 7. Conclusion

ConvoFlow is a well-designed and well-engineered marketing automation platform with a rich set of features. The application is built on a modern technology stack and follows best practices for security, scalability, and maintainability. The use of Supabase for the backend and database provides a powerful and flexible platform for building and deploying the application.