import { ActionPanel, List, Action, showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";

interface FileItem {
  name: string;
  path: string;
  // Additional properties from your MCP API can be added here
}

export default function SearchFiles() {
  const [searchText, setSearchText] = useState("");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Debounced search to avoid too many requests while typing
    const timeout = setTimeout(() => {
      const searchFiles = async () => {
        setIsLoading(true);
        try {
          const query = searchText ? `?q=${encodeURIComponent(searchText)}` : "";
          const response = await fetch(`http://localhost:3000/search${query}`);
          if (!response.ok) {
            throw new Error("Error fetching files from MCP server");
          }
          const data = await response.json();
          // Assuming your API returns an array of file objects
          setFiles(data);
        } catch (error) {
          console.error("Error fetching files:", error);
          await showToast(Toast.Style.Failure, "Failed to fetch files", String(error));
        } finally {
          setIsLoading(false);
        }
      };
      searchFiles();
    }, 300);

    return () => clearTimeout(timeout);
  }, [searchText]);

  return (
    <List searchBarPlaceholder="Search files…" isLoading={isLoading} onSearchTextChange={setSearchText}>
      {files.map((file, index) => {
        // Extract file extension. If there's no extension, it defaults to an empty string.
        const fileExtension = file.name.includes(".") ? file.name.split(".").pop() || "" : "";
        return (
          <List.Item
            key={file.path + index}
            title={file.name}
            accessoryTitle={fileExtension}
            actions={
              <ActionPanel>
                <Action
                  title="Open File"
                  onAction={() => {
                    // You can implement file opening or fetching file content via /file endpoint here.
                    console.log(`Selected file: ${file.path}`);
                  }}
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
} 