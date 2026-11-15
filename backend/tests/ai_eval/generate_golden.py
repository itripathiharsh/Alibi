"""Generate golden extraction evaluation dataset (>= 150 items) for AC-M2-2."""

import json
from pathlib import Path

golden_items = []


# Helper to add
def add_item(text, has_deadline, priority=None, estimate=None, project=None, tags=None):
    golden_items.append(
        {
            "id": len(golden_items) + 1,
            "input": text,
            "expected_has_deadline": has_deadline,
            "expected_priority": priority,
            "expected_estimate_min": estimate,
            "expected_project": project,
            "expected_tags": tags or [],
        }
    )


# 1. Standard relative deadlines (items 1-30)
add_item("Submit project report by tomorrow 5pm", True, priority=None)
add_item("Call doctor tomorrow morning", True)
add_item("Prepare slides by tomorrow afternoon", True)
add_item("Review client feedback tomorrow evening", True)
add_item("Finish code review tomorrow night", True)
add_item("Send weekly update by EOD", True)
add_item("Deploy backend fix before end of day", True)
add_item("Call mom tonight", True)
add_item("Team sprint planning by next monday", True)
add_item("Submit timesheet before next week", True)
add_item("Prepare invoice by friday", True)
add_item("Review architecture doc by wednesday", True)
add_item("Meeting with advisor on thursday", True)
add_item("Complete tax filing by 31st march", True)
add_item("Renew domain by 15th nov", True)
add_item("Christmas shopping before 25 dec 5pm", True)
add_item("Pay electric bill by tomorrow", True)
add_item("Send proposal due friday 4pm", True)
add_item("Submit draft deadline: tomorrow", True)
add_item("Final submission until next monday", True)
add_item("Sync with QA team tomorrow 10am", True)
add_item("Send pitch deck by tomorrow 3pm", True)
add_item("Release v1.2 by next tuesday", True)
add_item("Finish design critique by friday morning", True)
add_item("Team standup on monday", True)
add_item("Write blog post by sunday", True)
add_item("File GST return before 20th november", True)
add_item("Fix login issue by tonight", True)
add_item("Database migration before tomorrow 9am", True)
add_item("Deliver assets due next friday", True)

# 2. Priority combinations (items 31-60)
add_item("Urgent server crash fix asap", False, priority=1)
add_item("Critical payment gateway bug #bug", False, priority=1, tags=["bug"])
add_item("P1 outage in production by tonight", True, priority=1)
add_item("Emergency security patch before EOD", True, priority=1)
add_item("Fix broken navbar asap by tomorrow", True, priority=1)
add_item("High priority investor update", False, priority=2)
add_item("Important client demo by tomorrow 2pm", True, priority=2)
add_item("P2 ticket review with team", False, priority=2)
add_item("Update privacy policy important", False, priority=2)
add_item("High priority release checklist by friday", True, priority=2)
add_item("Medium priority cleanup of old branch", False, priority=3)
add_item("Normal priority documentation review", False, priority=3)
add_item("P3 refactoring of utils module", False, priority=3)
add_item("Update README formatting normal priority", False, priority=3)
add_item("Check logs tomorrow medium priority", True, priority=3)
add_item("Low priority font exploration", False, priority=4)
add_item("Someday learn Rust", False, priority=4)
add_item("Trivial typo fix in footer", False, priority=4)
add_item("P4 explore new css framework", False, priority=4)
add_item("Clean up downloads folder someday", False, priority=4)
add_item("Urgent: renew SSL cert by tomorrow morning", True, priority=1)
add_item("Critical: fix auth token leak immediately", False, priority=1)
add_item("Important: complete audit report before next monday", True, priority=2)
add_item("P1: resolve deadlock in job queue", False, priority=1)
add_item("High priority: backup postgres database tonight", True, priority=2)
add_item("P4: re-organize bookmarks bar", False, priority=4)
add_item("Someday: write personal autobiography", False, priority=4)
add_item("Low priority: change button hover color", False, priority=4)
add_item("Urgent: reply to legal notice before EOD", True, priority=1)
add_item("Important: update terms of service", False, priority=2)

# 3. Estimates & Durations (items 61-90)
add_item("Quick sync with designer for 30 mins", False, estimate=30)
add_item("Deep focus coding session 2h", False, estimate=120)
add_item("Review pull request in 45 mins", False, estimate=45)
add_item("Quick phone call half an hour", False, estimate=30)
add_item("Write unit tests 1.5 hours", False, estimate=90)
add_item("Weekly team sync 1h by tomorrow", True, estimate=60)
add_item("Lunch break 45 min", False, estimate=45)
add_item("Setup development container 2 hours", False, estimate=120)
add_item("Debugging memory leak 3h by tonight", True, estimate=180)
add_item("Gym workout 1 hour tomorrow morning", True, estimate=60)
add_item("Read research paper 2h", False, estimate=120)
add_item("Customer support triage 30m by EOD", True, estimate=30)
add_item("Database schema design 4h", False, estimate=240)
add_item("Write API documentation 2.5h", False, estimate=150)
add_item("Conduct candidate interview 1h by tomorrow 3pm", True, estimate=60)
add_item("Proofread article half an hour", False, estimate=30)
add_item("Performance profiling 2h before next week", True, estimate=120)
add_item("Refactor auth module 3 hours", False, estimate=180)
add_item("Create slide deck 1.5h by friday", True, estimate=90)
add_item("Walk dog 30 mins", False, estimate=30)
add_item("Urgent 30 min quick fix for bug", False, priority=1, estimate=30)
add_item("Important 2h meeting with stakeholders by tomorrow", True, priority=2, estimate=120)
add_item("Deep work 4h on compiler optimization", False, estimate=240)
add_item("Review contracts 1h by EOD", True, estimate=60)
add_item("P1 outage investigation 2h", False, priority=1, estimate=120)
add_item("Study dynamic programming 2h", False, estimate=120)
add_item("Fix styling glitches 45 mins", False, estimate=45)
add_item("Update dependencies 1h by tomorrow", True, estimate=60)
add_item("Record demo video 30 mins", False, estimate=30)
add_item("Test disaster recovery 3h before next monday", True, estimate=180)

# 4. Tags & Projects (@project, #tag) (items 91-120)
add_item("Implement user onboarding in @alibi", False, project="alibi")
add_item("Refactor sync protocol in @alibi by tomorrow 5pm", True, project="alibi")
add_item("Design pricing page in @marketing", False, project="marketing")
add_item("Write literature review chapter in @thesis", False, project="thesis")
add_item("Fix broken build #ci #devops", False, tags=["ci", "devops"])
add_item("Update landing page copy @marketing #design", False, project="marketing", tags=["design"])
add_item(
    "Add postgres indexes @alibi #database #perf", False, project="alibi", tags=["database", "perf"]
)
add_item("Buy groceries #personal", False, tags=["personal"])
add_item("Study for midterm exam @university #study", False, project="university", tags=["study"])
add_item(
    "File tax deduction proofs @finance #taxes by 31st march",
    True,
    project="finance",
    tags=["taxes"],
)
add_item(
    "Urgent bug in login flow @alibi #bug #auth",
    False,
    priority=1,
    project="alibi",
    tags=["bug", "auth"],
)
add_item(
    "Write blog post on distributed systems @blog #writing", False, project="blog", tags=["writing"]
)
add_item(
    "Set up CI runner @infrastructure #devops by tomorrow",
    True,
    project="infrastructure",
    tags=["devops"],
)
add_item("Doctor appointment #health tomorrow morning", True, tags=["health"])
add_item("Schedule oil change #car", False, tags=["car"])
add_item("Review sprint backlog in @alibi", False, project="alibi")
add_item("Clean up git history in @alibi #git", False, project="alibi", tags=["git"])
add_item("Create Figma mockups @design #ui by friday", True, project="design", tags=["ui"])
add_item("Prepare balance sheet @finance by EOD", True, project="finance")
add_item("Plan weekend trip #travel", False, tags=["travel"])
add_item("Read 20 pages of book #reading", False, tags=["reading"])
add_item("Fix sound driver on desktop #hardware", False, tags=["hardware"])
add_item("Upgrade node to v22 #tooling", False, tags=["tooling"])
add_item("Renew passport #government by next month", True, tags=["government"])
add_item(
    "Implement refresh token rotation @alibi #security", False, project="alibi", tags=["security"]
)
add_item("Refactor task repository @alibi by tonight", True, project="alibi")
add_item("Review thesis draft with advisor @thesis on monday", True, project="thesis")
add_item(
    "Setup Prometheus metrics @infrastructure #monitoring",
    False,
    project="infrastructure",
    tags=["monitoring"],
)
add_item("Buy flight tickets #vacation", False, tags=["vacation"])
add_item("Order new headphones #shopping", False, tags=["shopping"])

# 5. No-Deadline and Adversarial Cases (items 121-160)
add_item("Refactor database models to use modern typing", False)
add_item("Read chapter 4 of operating systems book", False)
add_item("Buy organic groceries from farmers market", False)
add_item("Fix broken button style on settings screen", False)
add_item("Clean and declutter physical desk", False)
add_item("Think about system architecture for v2", False)
add_item("Maybe sometime later we can look into GraphQL", False)
add_item("Someday in the future learn how to play guitar", False, priority=4)
add_item("No rush at all just check when free", False)
add_item("We might do this later if time permits", False)
add_item("Not urgent just an idea for later", False)
add_item("Casual brainstorm on product ideas", False)
add_item("Consider moving to rust in the long term", False)
add_item("Explore whether web workers make sense", False)
add_item("Evaluate alternative css color palettes", False)
add_item("Backup old photos from external hard drive", False)
add_item("Organize digital notes in knowledge base", False)
add_item("Look into ergonomic keyboard options", False)
add_item("Contemplate life choices during coffee break", False)
add_item("Review random bookmark from last year", False)
add_item("Archive unused slack channels", False)
add_item("Clean out old email subscriptions", False)
add_item("Water the house plants", False)
add_item("Check tire pressure on car", False)
add_item("Replace smoke detector batteries", False)
add_item("Clean refrigerator shelves", False)
add_item("Organize spice cabinet in kitchen", False)
add_item("Donate unused clothes to charity", False)
add_item("Update resume and linkedin summary", False)
add_item("Dust off the bookshelves", False)
add_item("Sharpen kitchen knives", False)
add_item("Sort through old receipts in shoe box", False)
add_item("Send report kal shaam tak", True)  # Hinglish: by tomorrow evening
add_item("Review PR by tomorrow pakka", True)  # Hinglish: by tomorrow for sure
add_item("Fix this bug asap bhai", False, priority=1)  # Hinglish: fix asap brother
add_item("Prepare invoice by EOD zaroor", True)  # Hinglish: by EOD definitely
add_item("Call electricity department kal subah", True)  # Hinglish: tomorrow morning
add_item("Team meeting agle hafte", True)  # Hinglish: next week
add_item("Complete assignment before friday shaam", True)  # Hinglish: before friday evening
add_item("Deploy production build by tonight", True)

out_file = Path("backend/tests/ai_eval/extraction_golden.jsonl")
with open(out_file, "w", encoding="utf-8") as f:
    for item in golden_items:
        f.write(json.dumps(item) + "\n")

print(f"Generated {len(golden_items)} golden items into {out_file}")
