#!/usr/bin/env bash
# Builds the static site and publishes it to S3 + CloudFront (stack aventon-mayab-frontend).
# Requires the AWS CLI with credentials and pnpm. Usage: ./frontend/deploy-aws.sh
set -euo pipefail
cd "$(dirname "$0")"

STACK=aventon-mayab-frontend
REGION=us-east-1
PNPM=${PNPM:-pnpm}

output() {
  aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
BUCKET=$(output BucketName)
DISTRIBUTION=$(output DistributionId)

# The public values (Cognito IDs, API URL) are baked into the build.
set -a
. ./.env.example
set +a
$PNPM install --frozen-lockfile
$PNPM build

# Hashed assets never change; HTML is revalidated on every visit so a new deploy shows up right away.
aws s3 sync out/_next/static "s3://$BUCKET/_next/static" --region "$REGION" \
  --cache-control "public, max-age=31536000, immutable"
aws s3 sync out "s3://$BUCKET" --region "$REGION" --delete --exclude "_next/static/*" \
  --cache-control "no-cache"
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION" --paths "/*" \
  --query Invalidation.Id --output text >/dev/null

echo "Publicado en $(output Url)"
