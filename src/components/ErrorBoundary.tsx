import { Component, type ErrorInfo, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";

// Um erro ao desenhar uma tela derrubaria o app inteiro e deixaria a janela
// vazia, sem nada que responda. Aqui a pessoa vê o aviso e consegue seguir.
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Erro na tela:", error, info.componentStack);
  }

  componentDidMount(): void {
    window.addEventListener("hashchange", this.reset);
  }

  componentWillUnmount(): void {
    window.removeEventListener("hashchange", this.reset);
  }

  reset = (): void => {
    if (this.state.error) this.setState({ error: null });
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="drag fixed inset-x-0 top-0 h-12" />
        <div className="h-14 w-14 rounded-card bg-danger/10 text-danger flex items-center justify-center">
          <TriangleAlert size={28} />
        </div>
        <div>
          <div className="text-title">Algo deu errado nesta tela</div>
          <div className="text-callout text-muted mt-1.5 max-w-[360px]">Seus dados estão salvos. Tente de novo ou volte para o início.</div>
        </div>
        <div className="flex gap-2 mt-2">
          <Button variant="secondary" onClick={this.reset}>
            Tentar de novo
          </Button>
          <Button
            onClick={() => {
              if (location.hash === "#/") this.reset();
              else location.hash = "#/";
            }}
          >
            Ir para o início
          </Button>
        </div>
      </div>
    );
  }
}
