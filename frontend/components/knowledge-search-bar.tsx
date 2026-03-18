import { ChevronDown, RefreshCw, RotateCcw, Search, X } from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import { toast } from "sonner";
import { useSyncAllConnectors } from "@/app/api/mutations/useSyncConnector";
import { Button } from "@/components/ui/button";
import { useKnowledgeFilter } from "@/contexts/knowledge-filter-context";
import { cn } from "@/lib/utils";
import { filterAccentClasses } from "./knowledge-filter-panel";

type KnowledgeSearchBarProps = {
  onAddKnowledge?: () => void;
  onAddKnowledgeMenuClick?: () => void;
  className?: string;
};

export const KnowledgeSearchBar = ({
  onAddKnowledge,
  onAddKnowledgeMenuClick,
  className,
}: KnowledgeSearchBarProps) => {
  const {
    selectedFilter,
    setSelectedFilter,
    parsedFilterData,
    queryOverride,
    setQueryOverride,
  } = useKnowledgeFilter();

  const [searchQueryInput, setSearchQueryInput] = useState(queryOverride || "");

  const handleSearch = useCallback(
    (e?: FormEvent<HTMLFormElement>) => {
      if (e) e.preventDefault();
      setQueryOverride(searchQueryInput.trim());
    },
    [searchQueryInput, setQueryOverride],
  );

  const handleReset = useCallback(() => {
    setSearchQueryInput("");
    setQueryOverride("");
  }, [setQueryOverride]);

  useEffect(() => {
    setSearchQueryInput(queryOverride);
  }, [queryOverride]);

  const syncAllConnectorsMutation = useSyncAllConnectors();

  return (
    <form
      onSubmit={handleSearch}
      className={cn("relative flex w-full items-stretch", className)}
    >
      {!!selectedFilter?.name && (
        <div
          title={selectedFilter.name}
          className={cn(
            "absolute -top-3 left-0 z-10 flex h-8 max-w-[260px] items-center gap-2 rounded-md border border-primary/60 px-3 text-sm shadow-sm",
            filterAccentClasses[parsedFilterData?.color || "zinc"],
          )}
        >
          <span className="truncate font-medium">{selectedFilter.name}</span>
          <button
            type="button"
            aria-label="Remove filter"
            className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center opacity-80 transition-opacity hover:opacity-100"
            onClick={() => setSelectedFilter(null)}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex h-12 w-full overflow-hidden border border-border bg-card">
        <div className="flex h-full flex-shrink-0 items-center justify-center">
          <Search
            className="h-4 w-4 m-4 text-[var(--icon-secondary)]"
            strokeWidth={1.75}
          />
        </div>

        <div className="flex min-w-0 flex-1 items-center">
          <input
            id="search-query"
            name="search-query"
            type="text"
            placeholder="Search knowledge"
            value={searchQueryInput}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setSearchQueryInput(e.target.value)
            }
            className="h-full w-full bg-transparent text-sm text-[hsl(var(--placeholder))] placeholder:text-[hsl(var(--placeholder))]"
          />
          {searchQueryInput && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={handleReset}
              className="mr-2 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          disabled={syncAllConnectorsMutation.isPending}
          size="icon"
          className="h-auto flex-shrink-0 rounded-none hover:bg-accent hover:text-foreground"
          aria-label="Sync"
          onClick={async () => {
            try {
              toast.info("Syncing all cloud connectors...");
              const result = await syncAllConnectorsMutation.mutateAsync();
              if (result.status === "no_files") {
                toast.info(
                  result.message ||
                    "No cloud files to sync. Add files from cloud connectors first.",
                );
              } else if (
                result.synced_connectors &&
                result.synced_connectors.length > 0
              ) {
                toast.success(
                  `Sync started for ${result.synced_connectors.join(", ")}. Check task notifications for progress.`,
                );
              } else if (result.errors && result.errors.length > 0) {
                toast.error("Some connectors failed to sync");
              }
            } catch (error) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : "Failed to sync connectors",
              );
            }
          }}
        >
          <RefreshCw className="h-4 w-4 m-4 text-[var(--icon-primary)]" />
        </Button>

        <Button
          type="button"
          onClick={onAddKnowledge}
          className="h-auto rounded-none border-l border-border bg-blue-600 px-6 text-base font-medium text-white hover:bg-blue-700"
        >
          Add knowledge
        </Button>

        <Button
          type="button"
          variant="default"
          size="icon"
          onClick={onAddKnowledgeMenuClick}
          className="h-auto w-16 flex-shrink-0 rounded-none border-l border-blue-500 bg-blue-600 text-white hover:bg-blue-700"
          aria-label="Open add knowledge menu"
        >
          <ChevronDown className="h-5 w-5" />
        </Button>
      </div>
    </form>
  );
};
