# Chat Universal — Hermes Gateway Integration Plan

## Visão Geral

Criar uma integração bidirecional entre o Chat Universal (web chat) e o Hermes Agent (IA), similar ao que já existe para Telegram. Um usuário do chat-universal pode conversar com o Hermes como se fosse outro usuário (bot `hermes_agent`).

## Arquitetura

```
┌─ Chat Universal ─────────────────────────────────┐
│  Usuário "gian" envia msg pra "hermes_agent"      │
│  └→ Server detecta que é pra um bot               │
│       └→ POST http://hermes:PORTA/inbound         │
│            {user_id, username, text, conv_id}     │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌─ Hermes Agent ────────────────────────────────────┐
│  Plugin: Chat Universal Adapter                    │
│  ┌────────────────────────────────────────────┐   │
│  │ HTTP Listener (/inbound)                    │   │
│  │  → MessageEvent(user, text)                │   │
│  │  → handle_message(event)                   │   │
│  │  → Agente processa (LLM + tools)           │   │
│  │  → send(chat_id, response)                 │   │
│  │       └→ POST /api/webhooks/hermes         │   │
│  │            {target_user, message}           │   │
│  └────────────────────────────────────────────┘   │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌─ Chat Universal ─────────────────────────────────┐
│  Webhook /api/webhooks/hermes recebe resposta    │
│  → Socket.IO emite "message:new" pro usuário     │
│  → Usuário vê a resposta em tempo real           │
└─────────────────────────────────────────────────┘
```

## Repositórios envolvidos

1. **Hermes Agent** — plugin em `~/.hermes/plugins/platforms/chat_universal/`
2. **chat-universal-server** — `~/Documentos/Repos/chat-universal-server/` (GitHub: gipierogiglio-prog/chat-universal-server)
3. **chat-universal-client** — `~/Documentos/Repos/chat-universal-client/` (GitHub: gipierogiglio-prog/chat-universal-client)

## Pré-requisitos (já existentes)

- chat-universal-server tem webhook `POST /api/webhooks/hermes` autenticado via `x-api-key`
- chat-universal-server tem `HERMES_API_KEY` configurável no docker-compose
- Ambos os containers estão na rede Docker `devgiglio-network`
- Hermes Agent roda no mesmo VPS (ou acessível via rede)

---

## Passo 1: Plugin Hermes — Chat Universal Adapter

### 1.1 Criar `~/.hermes/plugins/platforms/chat_universal/plugin.yaml`

```yaml
name: chat-universal-platform
label: Chat Universal
kind: platform
version: 1.0.0
description: >
  Chat Universal gateway adapter for Hermes Agent.
  Receives messages from chat-universal users via HTTP webhook
  and sends responses back through the chat-universal API.
author: Gian

requires_env:
  - name: CHAT_UNIVERSAL_API_URL
    description: "Base URL of the chat-universal server (e.g. https://chat-universal.devgiglio.uk)"
    prompt: "Chat Universal URL"
    password: false
  - name: CHAT_UNIVERSAL_API_KEY
    description: "API key for chat-universal webhook (same as HERMES_API_KEY)"
    prompt: "Chat Universal API key"
    password: true

optional_env:
  - name: CHAT_UNIVERSAL_LISTEN_PORT
    description: "Port for the inbound webhook listener (default: 8645)"
    prompt: "Listen port"
    password: false
  - name: CHAT_UNIVERSAL_ALLOWED_USERS
    description: "Comma-separated list of allowed chat-universal usernames"
    prompt: "Allowed users (comma-separated)"
    password: false
  - name: CHAT_UNIVERSAL_ALLOW_ALL_USERS
    description: "Allow all users (true/false)"
    prompt: "Allow all users?"
    password: false
  - name: CHAT_UNIVERSAL_HOME_CHANNEL
    description: "Home channel for cron/notification delivery"
    prompt: "Home channel"
    password: false
```

### 1.2 Criar `~/.hermes/plugins/platforms/chat_universal/adapter.py`

Adapter que estende `BasePlatformAdapter`:

```python
"""
Chat Universal Platform Adapter for Hermes Agent.

Plugin-based gateway adapter that:
1. Starts an aiohttp server listening for inbound messages from chat-universal
2. When a message arrives (POST /inbound), creates a MessageEvent and dispatches
   to the agent loop
3. Sends responses back via chat-universal's webhook API (POST /api/webhooks/hermes)
"""

import asyncio
import json
import logging
import os
import time
from typing import Any, Dict, List, Optional

try:
    from aiohttp import web
    AIOHTTP_AVAILABLE = True
except ImportError:
    AIOHTTP_AVAILABLE = False
    web = None

from gateway.config import Platform, PlatformConfig
from gateway.platforms.base import (
    BasePlatformAdapter,
    MessageEvent,
    MessageType,
    SendResult,
)

logger = logging.getLogger(__name__)

DEFAULT_PORT = 8645
DEFAULT_HOST = "0.0.0.0"
MAX_MESSAGE_LENGTH = 10000


def check_chat_universal_requirements() -> bool:
    """Check if dependencies are available."""
    return AIOHTTP_AVAILABLE and bool(os.getenv("CHAT_UNIVERSAL_API_URL"))


class ChatUniversalAdapter(BasePlatformAdapter):
    """Adapter for Chat Universal web chat platform."""

    def __init__(self, config: PlatformConfig):
        super().__init__(config, Platform.CHAT_UNIVERSAL)
        self.api_url = (config.extra or {}).get("api_url", "") or os.getenv("CHAT_UNIVERSAL_API_URL", "")
        self.api_key = config.token or os.getenv("CHAT_UNIVERSAL_API_KEY", "")
        self.listen_host = (config.extra or {}).get("listen_host", DEFAULT_HOST)
        self.listen_port = int((config.extra or {}).get("listen_port", "") or os.getenv("CHAT_UNIVERSAL_LISTEN_PORT", str(DEFAULT_PORT)))
        self._app: Optional[web.Application] = None
        self._runner: Optional[web.AppRunner] = None
        self._site: Optional[web.TCPSite] = None
        self._session_map: Dict[str, str] = {}  # chat_user_id -> hermes_user_id mapping

    async def connect(self) -> bool:
        """Start the HTTP server for receiving messages."""
        if not self.api_url or not self.api_key:
            logger.error("Chat Universal: CHAT_UNIVERSAL_API_URL and CHAT_UNIVERSAL_API_KEY are required")
            return False

        self._app = web.Application()
        self._app.router.add_post("/inbound", self._handle_inbound)
        self._app.router.add_get("/health", self._handle_health)

        self._runner = web.AppRunner(self._app)
        await self._runner.setup()
        self._site = web.TCPSite(self._runner, self.listen_host, self.listen_port)
        
        try:
            await self._site.start()
            logger.info(f"Chat Universal adapter listening on {self.listen_host}:{self.listen_port}")
            return True
        except Exception as e:
            logger.error(f"Chat Universal: failed to start HTTP server: {e}")
            return False

    async def disconnect(self):
        """Stop the HTTP server."""
        if self._site:
            await self._site.stop()
        if self._runner:
            await self._runner.cleanup()

    async def send(
        self,
        chat_id: str,
        text: str,
        reply_to_message_id: Optional[str] = None,
        **kwargs,
    ) -> SendResult:
        """Send a response back to chat-universal user via webhook."""
        # chat_id here is the username of the target user in chat-universal
        import aiohttp

        payload = {
            "target_user": chat_id,
            "message": text[:MAX_MESSAGE_LENGTH],
            "type": "text",
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.api_url}/api/webhooks/hermes",
                    headers={
                        "x-api-key": self.api_key,
                        "Content-Type": "application/json",
                    },
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=30),
                ) as resp:
                    if resp.status == 201:
                        data = await resp.json()
                        return SendResult(
                            success=True,
                            message_id=str(data.get("message_id", "")),
                            chat_id=chat_id,
                        )
                    else:
                        error_text = await resp.text()
                        logger.error(f"Chat Universal send failed ({resp.status}): {error_text}")
                        return SendResult(
                            success=False,
                            message_id="",
                            chat_id=chat_id,
                            error=f"HTTP {resp.status}: {error_text}",
                        )
        except Exception as e:
            logger.error(f"Chat Universal send error: {e}")
            return SendResult(success=False, message_id="", chat_id=chat_id, error=str(e))

    async def send_typing(self, chat_id: str):
        """Typing indicator - not supported by chat-universal webhook API currently."""
        pass

    async def send_image(
        self, chat_id: str, image_url: str, caption: Optional[str] = None
    ) -> SendResult:
        """Send an image - not supported yet."""
        text = caption or ""
        if image_url:
            text = f"{text}\n{image_url}" if text else image_url
        return await self.send(chat_id, text)

    async def get_chat_info(self, chat_id: str) -> dict:
        """Get info about a chat/user."""
        return {"name": chat_id, "type": "dm", "chat_id": chat_id}

    async def _handle_inbound(self, request: web.Request) -> web.Response:
        """Handle incoming message from chat-universal server."""
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)

        user_id = body.get("user_id") or body.get("username")
        username = body.get("username", user_id)
        text = body.get("text", "")
        conversation_id = body.get("conversation_id", "")

        if not user_id or not text:
            return web.json_response({"error": "user_id and text are required"}, status=400)

        # Build the source and dispatch to agent
        source = self.build_source(
            platform_id="chat_universal",
            chat_id=username,
            user_id=user_id,
            user_name=username,
        )

        event = MessageEvent(
            source=source,
            message_id=str(int(time.time() * 1000)),
            text=text,
            type=MessageType.TEXT,
            timestamp=time.time(),
        )

        await self.handle_message(event)

        # Return immediately - response will be sent asynchronously via send()
        return web.json_response({"status": "accepted"}, status=202)

    async def _handle_health(self, request: web.Request) -> web.Response:
        return web.json_response({"status": "ok", "platform": "chat_universal"})
```

### 1.3 Criar `~/.hermes/plugins/platforms/chat_universal/__init__.py`

```python
"""
Chat Universal platform adapter plugin.
"""
```

---

## Passo 2: Modificar chat-universal-server para encaminhar mensagens ao Hermes

### 2.1 Arquivo: `src/lib/deliver.ts`

Quando uma mensagem é enviada para o `hermes_agent` bot (ou qualquer bot com `isBot: true` que tenha integração Hermes), ao invés de apenas salvar no DB, encaminhar para o Hermes via HTTP POST.

Adicionar função `forwardToExternalAgent(message, sender, bot)` que:
1. Identifica qual agente externo (hermes, openclaw)
2. Faz POST para a URL configurada (ex: `http://hermes:8645/inbound`)
3. Recebe a resposta (assíncrona, via webhook existente)

### 2.2 Arquivo: `src/config.ts`

Adicionar env vars:
```typescript
hermesWebhookUrl: process.env.HERMES_WEBHOOK_URL ?? "",
```

### 2.3 Arquivo: `docker-compose.yml`

Adicionar:
```yaml
HERMES_WEBHOOK_URL: http://172.17.0.1:8645
```
(Ou o IP/porta onde o Hermes estiver escutando)

### 2.4 Fluxo de encaminhamento (Socket.IO + mensagens)

No handler de mensagem `message:send` (Socket.IO), depois de criar a mensagem no DB:
1. Verificar se `message.senderId` não é o bot (evitar loop)
2. Verificar se a conversa é com o `hermes_agent` (user com `isBot: true` e `username === 'hermes_agent'`)
3. Se sim, fazer POST para `HERMES_WEBHOOK_URL/inbound` com `{user_id, username, text, conversation_id}`
4. A resposta virá pelo webhook `/api/webhooks/hermes` (já implementado!)

---

## Passo 3: Configurar env vars e deploy

### 3.1 Chat Universal Server

No `docker-compose.yml`:
```yaml
HERMES_WEBHOOK_URL: http://172.17.0.1:8645
HERMES_API_KEY: uma-chave-secreta-aqui
```

### 3.2 Hermes Gateway

No `.env` do Hermes:
```
CHAT_UNIVERSAL_API_URL=https://chat-universal.devgiglio.uk
CHAT_UNIVERSAL_API_KEY=uma-chave-secreta-aqui
CHAT_UNIVERSAL_LISTEN_PORT=8645
```

### 3.3 Registrar o Plugin

```bash
hermes plugins install ~/.hermes/plugins/platforms/chat_universal/
hermes gateway restart
```

---

## Considerações

1. **Loop prevention** — O server não deve re-encaminhar respostas do Hermes de volta pro Hermes (verificar se sender é bot)
2. **Autenticação** — O endpoint `/inbound` do Hermes deve validar um token/API key compartilhado
3. **Histórico** — As mensagens da conversa com Hermes persistem no chat-universal (já salvas pelo webhook existente)
4. **Estados** — Hermes mantém sessão por usuário (como no Telegram), identificando pelo `chat_id = username`
5. **Typing indicator** — Opcional: chat-universal pode mostrar "Hermes está digitando" via Socket.IO enquanto aguarda resposta
