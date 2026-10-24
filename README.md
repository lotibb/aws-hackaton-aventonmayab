# aws-hackaton-aventonmayab

Backend en AWS para Aventón Mayab (demo de hackathon).

```
Celular → Vercel → API Gateway (JWT de Cognito) → Lambda → DynamoDB
```

Región: **us-east-1** para todo.

## Paso 2: Login con Cognito

`infra/cognito.yaml` crea:

- **User Pool**: inicio de sesión con correo. Cognito envía el código de 6 dígitos.
- **Pre sign-up Lambda**: rechaza cualquier correo que no termine en `@anahuac.mx`.
- **App Client** sin secreto (para el navegador).

### Desplegar (consola, ~5 min)

1. AWS Console → **CloudFormation** → región **us-east-1** → **Create stack** → *With new resources*.
2. **Upload a template file** → `infra/cognito.yaml` → Next.
3. Stack name: `aventon-mayab-auth` → Next → Next.
4. Marca *"I acknowledge that AWS CloudFormation might create IAM resources"* → **Submit**.
5. Cuando diga `CREATE_COMPLETE`, abre la pestaña **Outputs** y copia `UserPoolId` y `UserPoolClientId`.

<details>
<summary>O con la CLI</summary>

```sh
aws cloudformation deploy --region us-east-1 \
  --template-file infra/cognito.yaml \
  --stack-name aventon-mayab-auth \
  --capabilities CAPABILITY_IAM

aws cloudformation describe-stacks --region us-east-1 \
  --stack-name aventon-mayab-auth --query "Stacks[0].Outputs"
```
</details>

### Conectar el frontend

1. En el proyecto de Vercel: `npm install aws-amplify`.
2. Copia `frontend/lib/services/authService.ts` sobre el mock en `/lib/services`.
3. Variables de entorno en Vercel (y en `.env.local`). Estos valores pueden ser públicos:

   ```
   NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx
   NEXT_PUBLIC_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

   (Si el frontend usa Vite en lugar de Next.js, cambia el prefijo a `VITE_` y usa `import.meta.env`.)

Flujo: `authService.signUp(email, password)` → el alumno recibe el código → `authService.confirmSignUp(email, code)` → `authService.signIn(email, password)`.

### Probar

- Registro con `algo@gmail.com` → error *"Solo se permiten correos @anahuac.mx"*.
- Registro con `tu@anahuac.mx` → llega el código por correo → confirmar → entrar.
- Ver usuarios: Console → Cognito → User pools → `aventon-mayab-users` → Users.

**Límite de la demo:** el correo integrado de Cognito envía unos 50 correos al día. Alcanza para la demo; para producción se conecta Amazon SES.
