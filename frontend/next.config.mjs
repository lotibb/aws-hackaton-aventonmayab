/** @type {import('next').NextConfig} */
const nextConfig = {
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
