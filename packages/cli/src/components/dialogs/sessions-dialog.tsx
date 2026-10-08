import { useCallback, useEffect, useState } from "react";
import { TextAttributes } from "@opentui/core";
import { format } from "date-fns";
import path from "node:path";
import { useNavigate } from "react-router";
import { useDialog } from "../../providers/dialog";
import { useToast } from "../../providers/toast";
import { apiClient } from "../../lib/api-client";
import { getErrorMessage } from "../../lib/http-errors";
import { DialogSearchList } from "../dialog-search-list";
import type { InferResponseType } from "hono/client";

type Session = InferResponseType<(typeof apiClient.sessions)["$get"], 200>[number];

/** Returns a human-readable label for a session's project CWD. */
function cwdLabel(cwd: string): string {
  return path.basename(cwd) || cwd;
}

export const SessionsDialogContent = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const { close } = useDialog();
  const navigate = useNavigate();
  const { show } = useToast();

  const currentCwd = process.cwd();

  useEffect(() => {
    let ignore = false;

    const fetchSessions = async () => {
      try {
        const res = await apiClient.sessions.$get();
        if (!res.ok) {
          throw new Error(await getErrorMessage(res));
        }

        const data = await res.json();

        if (!ignore) {
          setSessions(data);
          setLoading(false);
        }
      } catch (error) {
        if (!ignore) {
          show({
            variant: "error",
            message: error instanceof Error ? error.message : "Failed to fetch sessions",
          });
          close();
        }
      }
    };

    fetchSessions();

    return () => {
      ignore = true;
    };
  }, [close, show]);

  const handleSelect = useCallback(
    (session: Session) => {
      close();
      navigate(`/sessions/${session.id}`);
    },
    [close, navigate],
  );

  if (loading) {
    return (
      <box flexDirection="column">
        <text attributes={TextAttributes.DIM}>Loading sessions...</text>
      </box>
    );
  }

  // Split into project sessions (same CWD) and others
  const projectSessions = sessions.filter((s) => s.cwd === currentCwd);
  const otherSessions = sessions.filter((s) => s.cwd !== currentCwd);

  // Merge with a separator marker so the list knows which group it's in
  type SessionItem = Session & { _separator?: string };
  let merged: SessionItem[] = [...projectSessions];
  if (otherSessions.length > 0 && projectSessions.length > 0) {
    // A virtual separator item (won't be navigated to)
    merged.push({
      id: "__separator__",
      title: "── Other Projects ──",
      createdAt: "",
      cwd: "",
      _separator: "true",
    } as SessionItem);
  }
  merged = [...merged, ...otherSessions];

  return (
    <DialogSearchList
      items={merged}
      onSelect={(session) => {
        if ((session as SessionItem)._separator) return;
        handleSelect(session);
      }}
      filterFn={(s, query) => {
        if ((s as SessionItem)._separator) return true;
        return s.title.toLowerCase().includes(query.toLowerCase());
      }}
      renderItem={(session, isSelected) => {
        if ((session as SessionItem)._separator) {
          return (
            <text selectable={false} attributes={TextAttributes.DIM}>
              {session.title}
            </text>
          );
        }
        const isProject = session.cwd === currentCwd;
        return (
          <>
            <text selectable={false} fg={isSelected ? "black" : "white"}>
              {session.title}
            </text>
            <box flexGrow={1} />
            {!isProject && session.cwd ? (
              <text
                selectable={false}
                fg={isSelected ? "black" : "cyan"}
                attributes={TextAttributes.DIM}
              >
                {cwdLabel(session.cwd)}{"  "}
              </text>
            ) : null}
            <text
              selectable={false}
              fg={isSelected ? "black" : undefined}
              attributes={TextAttributes.DIM}
            >
              {session.createdAt ? format(new Date(session.createdAt), "hh:mm a") : ""}
            </text>
          </>
        );
      }}
      getKey={(s) => s.id}
      placeholder="Search sessions"
      emptyText="No matching sessions"
    />
  );
};
