import { ActionPanel, List, Action, showToast, Toast } from "@raycast/api";
import { useState } from "react";
import fetch from "node-fetch";

interface SearchResult {
  path: string;
  name: string;
  type: string;
  content?: string;
  matchType: 'content' | 'filename';
}

interface SearchResponse {
  results: SearchResult[];
}

const SERVER_PORT = 49152;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

// Common text-based file extensions that we'll search content for
const TEXT_FILE_EXTENSIONS = ['.txt', '.md', '.pdf', '.doc', '.docx', '.rtf', '.json', '.js', '.ts', '.tsx', '.jsx', '.html', '.css'];

function fuzzyMatch(text: string, query: string): boolean {
  const pattern = query.split('').map(char => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  const regex = new RegExp(pattern, 'i');
  return regex.test(text);
}

export default function Command() {
  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const performSearch = async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${SERVER_URL}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query })
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const data = await response.json() as SearchResponse;
      setResults(data.results);
    } catch (error) {
      console.error('Search error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Search failed';
      setError(errorMessage);
      showToast({
        style: Toast.Style.Failure,
        title: "Search failed",
        message: errorMessage
      });
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <List
      isLoading={isLoading}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search files in Downloads folder (press Enter to search)..."
      throttle={true}
      enableFiltering={false}
      navigationTitle="Search Downloads"
      actions={
        <ActionPanel>
          <Action
            title="Search"
            onAction={() => searchText.trim().length >= 2 && performSearch(searchText)}
            shortcut={{ modifiers: [], key: "return" }}
          />
        </ActionPanel>
      }
    >
      {error ? (
        <List.EmptyView
          title="Error"
          description={error}
        />
      ) : searchText.trim().length < 2 ? (
        <List.EmptyView
          title="Start typing to search"
          description="Enter at least 2 characters and press Enter to search"
        />
      ) : isLoading ? (
        <List.EmptyView
          title="Searching..."
          description="Please wait while we process your query"
        />
      ) : results.length === 0 ? (
        <List.EmptyView
          title="No results found"
          description="Try a different search term"
        />
      ) : (
        results.map((item, index) => (
          <List.Item
            key={`${item.path}-${index}`}
            title={item.name}
            subtitle={item.matchType === 'content' 
              ? item.content?.slice(0, 100) + '...'
              : 'Matched filename'}
            accessories={[
              { text: item.type },
              { text: item.matchType === 'content' ? '📄 Content match' : '🔍 Filename match' }
            ]}
            detail={
              <List.Item.Detail
                markdown={item.matchType === 'content'
                  ? `## ${item.name}\n\n${item.content}`
                  : `## ${item.name}\n\n*File matched by name*`}
              />
            }
            actions={
              <ActionPanel>
                <Action.Open
                  title="Open File"
                  target={item.path}
                />
                <Action.ShowInFinder
                  path={item.path}
                  title="Show in Finder"
                />
                <Action.CopyToClipboard
                  content={item.path}
                  title="Copy Path"
                />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}