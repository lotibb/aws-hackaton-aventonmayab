import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
async function main() {
  try {
    const identity = await new STSClient({ region: process.env.AWS_REGION ?? "us-east-1" }).send(new GetCallerIdentityCommand({}));
    console.log({ account: identity.Account, arn: identity.Arn });
  } catch (e) {
    console.error(`No se pudo verificar acceso AWS: ${(e as Error).name}. Configura credenciales o AWS_PROFILE antes de desplegar.`);
    process.exitCode = 1;
  }
}
void main();
