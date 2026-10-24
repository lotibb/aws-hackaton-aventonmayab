import { fileURLToPath } from 'node:url'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The parking catalog is shared with the existing Lambda source directory.
  turbopack: { root: fileURLToPath(new URL('..', import.meta.url)) },
  // Static files only: hosted in S3 + CloudFront (backend/infra/frontend.yaml), no Next.js server.
  output: 'export',
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
