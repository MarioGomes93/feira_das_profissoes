# Feira das Profissões

Sistema interno para gestão da Feira das Profissões, com autenticação e persistência em SQLite.

## Executar

```bash
npm install
npm start
```

Abra `http://localhost:3000`.

Para desenvolvimento com reinício automático:

```bash
npm run dev
```

## Recursos

- Cadastro com validação de e-mail e senha protegida com hash bcrypt.
- Login com sessão persistida em SQLite.
- Recuperação e redefinição de senha com token de 15 minutos.
- Dashboard com departamentos, produtos disponíveis e funcionários/funções.
- Dados iniciais inseridos automaticamente na primeira execução.

Em ambiente local, o token de recuperação é exibido na tela para permitir o teste do fluxo. Em produção, substitua essa resposta por integração com um provedor de e-mail e defina `SESSION_SECRET` em `.env`.
