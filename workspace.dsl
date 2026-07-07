workspace "gitops-sandbox" "GitOps x Claude Agents — automacao de tarefas de engenharia disparada por labels do Linear, executada via GitHub Actions e Claude Code." {

    model {
        pmDev = person "PM / Dev" "Escreve specs, adiciona labels de agent na issue, revisa e aprova PRs. Nunca faz merge automatico." "Human"

        gitopsSandbox = softwareSystem "gitops-sandbox" "Orquestra a execucao de agentes Claude a partir de labels do Linear, com gates de seguranca e verificacao real de resultado." {

            webhook = container "Linear Webhook" "Recebe o evento do Linear, valida a assinatura e aplica os gates de autorizacao antes de disparar a pipeline." "Vercel Edge Function / TypeScript" {
                verifySignature   = component "verifyLinearSignature" "Verifica HMAC-SHA256 do payload." "TypeScript function"
                filterLabels      = component "isDispatchable" "Filtra labels agent:* / skill:* adicionadas neste evento." "TypeScript function"
                resolveTarget     = component "resolveTarget" "Resolve owner/repo alvo via REPO_MAP ou fallback single-repo." "TypeScript function"
                checkWriteAccess  = component "checkWriteAccess" "Mapeia o actor do Linear para um usuario GitHub e checa permissao write/admin." "TypeScript function"
                checkSpecApproved = component "hasApprovedSpec" "Bloqueia agent:generate-code se a issue nao tiver a label spec-approved." "TypeScript function"
                dispatch          = component "dispatchWorkflow" "Dispara o workflow_dispatch na API do GitHub Actions." "TypeScript function"

                verifySignature -> filterLabels "Payload autentico, segue para filtragem de labels"
                filterLabels -> resolveTarget "Ha label dispatchable, resolve o repo alvo"
                resolveTarget -> checkWriteAccess "Repo resolvido, checa autorizacao do actor"
                checkWriteAccess -> checkSpecApproved "Actor autorizado, checa spec (se generate-code)"
                checkSpecApproved -> dispatch "Todos os gates passaram, dispara a pipeline"
            }

            actionsPipeline = container "GitHub Actions Pipeline" "4 jobs: eval-prompts, auto-code-review, gitops-sync e run-agent. Roteia modelo/tools por label, executa o Claude e verifica o resultado." "GitHub Actions / YAML + Bash" {
                securityPreamble = component "Security preamble" "Marca conteudo de issue/PR/diff como dado, nunca instrucao (anti-prompt-injection)." "Bash"
                modelRouter      = component "Model router" "AGENT_MODEL_MAP — Haiku para tarefas simples, Sonnet para o resto." "Bash"
                toolsRouter      = component "Tools router" "AGENT_TOOLS_MAP — least-privilege, so as tools que o label documentado usa." "Bash"
                promptBuilder    = component "Prompt builder" "Monta o CLAUDE_PROMPT por label, validado por contrato estatico." "Bash"
                claudeInvocation = component "Claude CLI invocation" "Roda claude --print --output-format json com modelo/tools/prompt resolvidos." "Bash + Claude Code CLI"
                verifyBranch     = component "Verify branch" "Re-roda typecheck+test no branch real gerado (generate-code / create-specs)." "Bash"
                observability    = component "Observability" "Publica job summary e sobe o JSON bruto como artifact (90 dias)." "Bash + GitHub Actions"
                reportResult     = component "report-result.ts" "State machine label x status -> estado Linear + comentario." "TypeScript / tsx"

                securityPreamble -> promptBuilder "Prefixo de seguranca entra no prompt final"
                modelRouter -> claudeInvocation "Define --model"
                toolsRouter -> claudeInvocation "Define --allowedTools"
                promptBuilder -> claudeInvocation "Fornece o prompt via stdin"
                claudeInvocation -> verifyBranch "Execucao concluida, aciona verificacao (se aplicavel)"
                verifyBranch -> observability "Resultado real do typecheck/test alimenta o resumo"
                claudeInvocation -> observability "Duracao/tokens/custo do --output-format json"
                observability -> reportResult "Numeros de observability entram no comentario"
                verifyBranch -> reportResult "Status real (nao so exit code da CLI) define o resultado"
            }

            claudeCli = container "Claude Code CLI" "Motor de execucao do agente. Roda headless dentro do runner do job run-agent." "Claude Code CLI"

            scripts = container "Scripts TypeScript" "Sync bidirecional, parsing de PR, criacao de demanda furtiva e eval de prompts." "Node.js / TypeScript" {
            }

            config = container "sync-config.json" "IDs do workspace Linear (team, project, states) — nunca editado a mao." "JSON" "Config"
        }

        linear = softwareSystem "Linear" "Fonte da verdade de tarefas. Emite webhooks, recebe comentarios, documentos e mudancas de estado via GraphQL." "External"
        github = softwareSystem "GitHub" "Hospeda o codigo, roda o GitHub Actions e expõe a REST API de PRs/branches/workflow_dispatch." "External"
        anthropic = softwareSystem "Anthropic API" "Modelos Claude (Haiku 4.5 / Sonnet 5) que executam o raciocinio e as acoes do agente." "External"

        // Pessoa -> sistema (relacao de resumo, aparece no Contexto/Container)
        pmDev -> gitopsSandbox "Adiciona labels de agent, escreve specs, revisa e aprova PRs"

        // Pessoa -> sistemas externos (detalhe real do caminho)
        pmDev -> linear "Escreve specs, adiciona labels de agent na issue"
        pmDev -> github "Revisa e aprova PRs gerados pelo agente"

        // Sistema -> sistemas externos (nivel contexto)
        gitopsSandbox -> linear "Le/escreve issues, comentarios e documentos" "GraphQL API"
        gitopsSandbox -> github "Dispara workflows, abre PRs e branches" "REST API"
        gitopsSandbox -> anthropic "Executa o raciocinio do agente" "HTTPS API"

        // Containers -> sistemas externos e entre si
        linear -> webhook "Emite evento de issue" "Webhook HTTPS + HMAC-SHA256"
        webhook -> github "Dispara workflow_dispatch" "REST API"
        github -> actionsPipeline "Inicia a execucao do job no runner"
        actionsPipeline -> claudeCli "Invoca headless" "claude --print"
        claudeCli -> anthropic "Chama o modelo" "HTTPS API"
        claudeCli -> github "Commita, cria branch, abre PR" "git + REST API"
        actionsPipeline -> scripts "Executa sync, parsing e eval" "npx tsx"
        scripts -> linear "Le/escreve issues, comentarios e documentos" "GraphQL API"
        scripts -> config "Le IDs do workspace" "fs.readFile"
        actionsPipeline -> linear "Atualiza estado e posta comentario de resultado" "GraphQL API (via scripts)"
    }

    views {
        systemContext gitopsSandbox "SystemContext" "Nivel 1 — quem usa o sistema e com quais sistemas externos ele conversa." {
            include *
            autoLayout lr
        }

        container gitopsSandbox "Containers" "Nivel 2 — as pecas que rodam de fato e como se chamam." {
            include *
            include pmDev
            autoLayout lr
        }

        component webhook "WebhookComponents" "Nivel 3 — dentro do Linear Webhook: a cadeia de gates de seguranca." {
            include *
            autoLayout tb
        }

        component actionsPipeline "PipelineComponents" "Nivel 3 — dentro do job run-agent: roteamento, execucao e verificacao." {
            include *
            autoLayout tb
        }

        styles {
            element "Human" {
                shape Person
                background #08427B
                color #ffffff
            }
            element "Software System" {
                background #1168BD
                color #ffffff
            }
            element "External" {
                background #999999
                color #ffffff
            }
            element "Container" {
                background #438DD5
                color #ffffff
            }
            element "Config" {
                shape Folder
                background #85BBF0
                color #000000
            }
            element "Component" {
                background #85BBF0
                color #000000
            }
        }
    }

}
