"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Download, LockKeyhole, ShieldCheck, Smartphone, Users } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { organizationRequest, useOrganization } from "@/lib/organization-context";
import { PageHeading } from "@/components/org-ui";

interface OrganizationMember {
  membership_id: string;
  display_name: string | null;
  role: "owner" | "team_lead" | "member";
}

export default function OrganizationSettingsPage() {
  const { organization, refresh } = useOrganization();
  const { accessToken, logout } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [selectedMembership, setSelectedMembership] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!organization || organization.role !== "owner" || !accessToken) return;
    let cancelled = false;
    void organizationRequest<OrganizationMember[]>(
      accessToken,
      `/organizations/${organization.id}/members`,
    )
      .then((result) => {
        if (!cancelled) setMembers(result.filter((member) => member.role !== "owner"));
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Could not load organization members.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, organization]);

  if (!organization) return null;

  const setConsent = async (enabled: boolean) => {
    if (!accessToken) return;
    setBusy(true);
    setMessage(null);
    try {
      await organizationRequest(
        accessToken,
        `/organizations/${organization.id}/consent${enabled ? "" : "/revoke"}`,
        { method: "POST" },
      );
      await refresh();
      setMessage(
        enabled
          ? "Your professional activity will be shared from now on."
          : "Sharing is revoked. The organization no longer has access to your activity.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update sharing choice.");
    } finally {
      setBusy(false);
    }
  };

  const transferOwnership = async () => {
    if (!accessToken || !selectedMembership || confirmName.trim() !== organization.name) return;
    setBusy(true);
    setMessage(null);
    try {
      await organizationRequest(
        accessToken,
        `/organizations/${organization.id}/transfer-ownership`,
        {
          method: "POST",
          body: JSON.stringify({ membership_id: selectedMembership }),
        },
      );
      await refresh();
      setConfirmName("");
      setMessage("Ownership transferred. You now have team-lead access and can leave if you choose.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not transfer ownership.");
    } finally {
      setBusy(false);
    }
  };

  const leaveOrganization = async () => {
    if (!accessToken) return;
    setBusy(true);
    setMessage(null);
    try {
      await organizationRequest(accessToken, `/organizations/${organization.id}/leave`, {
        method: "POST",
      });
      await refresh();
      setMessage("You left the organization. Your personal ALIBI data remains yours.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not leave the organization.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="org-page">
      <PageHeading
        eyebrow="Workspace controls"
        title="Organization"
        description="Manage your workspace and understand exactly what can be seen."
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_.85fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Workspace</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">{organization.name}</h2>
          <p className="mt-1 text-sm capitalize text-slate-500">
            {organization.role.replace("_", " ")} · {organization.status}
          </p>
          <div className="mt-6 border-t border-slate-100 pt-5">
            <h3 className="font-semibold text-slate-800">Sharing boundary</h3>
            <div className="mt-3 space-y-3 text-sm text-slate-600">
              <p className="flex gap-2">
                <ShieldCheck size={18} className="shrink-0 text-emerald-600" />
                Only professional activity is visible after a member opts in.
              </p>
              <p className="flex gap-2">
                <LockKeyhole size={18} className="shrink-0 text-[#173e55]" />
                Notes, descriptions, attachments and personal, academic or learning records remain private.
              </p>
              <p className="flex gap-2">
                <Smartphone size={18} className="shrink-0 text-orange-600" />
                Individual ALIBI tools are available in the Android app.
              </p>
            </div>
            {organization.role === "member" && (
              <div className="mt-5 rounded-xl bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-4">
                  <span>
                    <b className="block text-sm text-slate-800">Share your professional activity</b>
                    <small className="text-xs text-slate-500">Only from the time you opt in</small>
                  </span>
                  <button
                    disabled={busy}
                    onClick={() => void setConsent(!organization.professional_sharing_consent)}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold ${organization.professional_sharing_consent ? "bg-white text-rose-600 ring-1 ring-slate-200" : "bg-[#092638] text-white"}`}
                  >
                    {organization.professional_sharing_consent ? "Revoke sharing" : "Opt in to share"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
        <aside className="rounded-2xl bg-[#092638] p-6 text-white">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 text-orange-300">
            <Download />
          </div>
          <h2 className="mt-5 text-xl font-semibold">ALIBI on Android</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Use the app for personal tasks, calendar, capture, vault and individual productivity features.
          </p>
          <a
            href="https://github.com/itripathiharsh/Alibi/raw/refs/heads/main/apk/ALIBI-0.1.0.apk"
            download="ALIBI-0.1.0.apk"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-[#092638] hover:bg-orange-50"
          >
            Download Android app <ArrowUpRight size={16} />
          </a>
        </aside>
      </div>

      {organization.role === "owner" && (
        <section className="mt-5 max-w-3xl rounded-2xl border border-amber-200 bg-amber-50/70 p-6">
          <div className="flex items-start gap-3">
            <Users className="mt-1 text-amber-700" size={20} />
            <div>
              <h2 className="font-semibold text-slate-900">Transfer ownership</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                The new owner receives full organization control. You become a team lead and can then leave.
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <select
              value={selectedMembership}
              onChange={(event) => setSelectedMembership(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800"
            >
              <option value="">Choose an active member</option>
              {members.map((member) => (
                <option key={member.membership_id} value={member.membership_id}>
                  {member.display_name || "ALIBI member"} · {member.role.replace("_", " ")}
                </option>
              ))}
            </select>
            <input
              value={confirmName}
              onChange={(event) => setConfirmName(event.target.value)}
              placeholder={`Type “${organization.name}” to confirm`}
              aria-label="Confirm organization name to transfer ownership"
              className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"
            />
            <button
              disabled={busy || !selectedMembership || confirmName.trim() !== organization.name}
              onClick={() => void transferOwnership()}
              className="rounded-xl bg-[#092638] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Transferring…" : "Transfer"}
            </button>
          </div>
        </section>
      )}

      {message && <p role="status" className="mt-5 max-w-3xl rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
      {organization.role !== "owner" && (
        <button
          disabled={busy}
          onClick={() => void leaveOrganization()}
          className="mt-6 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          Leave organization
        </button>
      )}
      <button onClick={() => void logout()} className="mt-6 ml-4 text-sm font-medium text-slate-400 hover:text-slate-700">
        Sign out
      </button>
      <p className="mt-8 text-xs text-slate-400">
        Parent/guardian access is not available in this version. Future sharing will require a separate, explicit consent flow.
      </p>
    </div>
  );
}
