import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { formatClock, formatMinutes } from "./time-format";

export type NotificationScenario =
  | "TIMER_RUNAWAY"
  | "DEADLINE_CRUNCH"
  | "MORNING_KICKOFF"
  | "SUNSET_SWEEP"
  | "GHOSTING";

export interface WittyCopy {
  title: string;
  body: string;
}

export const NOTIFICATION_STYLE_KEY = "alibi_notification_style";

/**
 * 25 Short & Crunchy Zomato-style punchlines for each scenario.
 * Meta-aware, movie/meme-referenced, culturally tuned, and under 15 words.
 */
export const WITTY_NOTIFICATION_VAULT: Record<NotificationScenario, WittyCopy[]> = {
  // Scenario 1: A task timer has been running continuously (> 2 hours)
  TIMER_RUNAWAY: [
    { title: "25 din mein paisa double? 💸", body: "Babu bhaiya, timer 2 ghante se chal raha hai. Stop ya break?" },
    { title: "70 minute khatam Kabir Khan ⏱️", body: "Ab toh break banta hai! Tap karke pause ya stop karo." },
    { title: "Control Uday, Control! 🧘", body: "Timer bhool gaye ya sach mein superhuman ban gaye ho?" },
    { title: "Bhai kya phoonk ke baitha hai? 🤯", body: "2 ghante non-stop focus? Thoda paani pi le dost." },
    { title: "Bhagwan ke bharose mat baitho 🎬", body: "Kahin bhagwan tumhare timer stop karne ke bharose na baitha ho." },
    { title: "Pushpa jhukega nahi... 🌺", body: "Par timer toh rokna padega na boss!" },
    { title: "Yeh hum hain, yeh hamara timer 📸", body: "Aur yahan background mein reels scroll ho rahi hain?" },
    { title: "Chilla chilla ke scheme bata de 📢", body: "Active timer world record todne pe tula hai." },
    { title: "Taareekh pe taareekh ⚖️", body: "Sunny Deol wants to know if this task has an ending date." },
    { title: "Wasseypur: Sabka badla lega 🩸", body: "Sabka record todega re tera ye 2 ghante ka timer." },
    { title: "Bhaag DK Bose 🏃", body: "Itna continuous bhaagega toh phone aur dimaag dono heat ho jayenge." },
    { title: "Papa ban gaya main, papa! 🐺", body: "Itna intense deep work? Stop the timer and take a breather." },
    { title: "Aap chronology samajhiye 📜", body: "Pehle task start hoga, fir khatam hoga. Beech mein pause bhi hota hai." },
    { title: "Ashneer: 'Yeh sab doglapan hai' 🦈", body: "Timer chal raha hai aur screen band hai? Hypocrisy band karo." },
    { title: "Utho Anarkali, Salim ka call hai 📱", body: "Timer 2 ghante se chalu hai, wrap it up!" },
    { title: "Zindagi jhandwa, fir bhi ghamandwa 😎", body: "Overtime ka koi extra bonus nahi mil raha, stop it." },
    { title: "Mogambo khush hua? 🦹", body: "Nahi hua. Kyunki timer abhi tak chalu chhod diya hai." },
    { title: "Main udna chahta hoon... ✈️", body: "Par pehle iss chalte timer ko stop karna chahta hoon." },
    { title: "Rishte mein toh hum baap lagte hain 🕶️", body: "Aur timer mein tumhare timekeeper. Ab toh rok lo." },
    { title: "Choti bachhi ho kya? 🍼", body: "Timer band karna samajh nahi aata?" },
    { title: "Kya chal raha hai? Timer chal raha hai 🌫️", body: "Fogg nahi, 2 ghante se tumhara timer chal raha hai." },
    { title: "CID Daya: 'Darwaza tod do' 🚪", body: "Daya bol raha hai timer tod ke break le lo." },
    { title: "Don ko pakadna mushkil hi nahi... 🕵️", body: "Par timer stop karna bohot aasaan hai. Just one tap." },
    { title: "Sholay: 'Kitne aadmi the?' 🐎", body: "Aadmi ek, timer do ghante se active. Bas karo Sarkar." },
    { title: "Main apni favourite hoon 💅", body: "Toh apni favourite self ko 5 min ka chai break de do." },
  ],

  // Scenario 2: Upcoming task deadline. "{left}" is filled with the real time left (the
  // user's reminder lead), never a fixed "15 minutes" (logic audit 2026-11-24).
  DEADLINE_CRUNCH: [
    { title: "Sirf {left} bache hain! ⏳", body: "Chak De phatte ya game over? Finish the task now!" },
    { title: "Picture abhi baaki hai dost 🎞️", body: "Par deadline mein sirf {left} baaki hain. Speed up!" },
    { title: "Darr ke aage jeet hai 🧗", body: "Deadline sir pe hai, overthinking chhodo aur nipat lo." },
    { title: "Khatam, tata, bye-bye, goodbye! 👋", body: "Agar agle {left} mein complete nahi kiya toh yahi hoga." },
    { title: "Apna time aayega? ⏳", body: "Time aa nahi raha, time jaa raha hai! {left} left." },
    { title: "Shit just got real 💥", body: "Task deadline is {left} away. Focus mode ON." },
    { title: "Mission Impossible theme playing 🎵", body: "{left} to defuse this deadline. You got this." },
    { title: "Jaldi wahan se hato! 🚨", body: "Deadline knocking at the door with a danda." },
    { title: "Aila! Jadoo! 👽", body: "Jadoo bhi is deadline ko extend nahi kar sakta. Submit karo." },
    { title: "Singham: 'Aata maajhi satakli' 🦁", body: "Deadline miss hui toh manager ki satak jayegi." },
    { title: "Bhool Bhulaiyaa: 'Ami je tomar' 👻", body: "Manjulika se pehle deadline room mein ghus jayegi." },
    { title: "Ye kya tareeka hai bhai? 🤷", body: "Last-minute panic se pehle tick kar lo." },
    { title: "Mirzapur: 'Gaddi humari hogi' 👑", body: "Trophy unko milti hai jo deadline pe submit karte hain." },
    { title: "Lord Bobby entry theme 🎧", body: "Walk in, crush the remaining {left}, walk out." },
    { title: "Last over: 12 runs needed 🏏", body: "{left} on the clock. Hit the winning shot." },
    { title: "Kashyap climax mode 🎬", body: "Raw, gritty final {left}. Nail this task." },
    { title: "Shark Tank: 'I am out' 🦈", body: "Deadline miss hui toh investment out. Finish it!" },
    { title: "Zomato rider on the way 🛵", body: "Your deadline is arriving faster than your biryani." },
    { title: "Fast & Furious: Family first 🚗", body: "Task completion second. {left} remaining!" },
    { title: "Kuch toh sharam karo, janab 🫣", body: "Deadline sir pe naach rahi hai aur tum shaant ho?" },
    { title: "Clock is ticking louder than anxiety ⏰", body: "Stop thinking, start typing. Wrap it up." },
    { title: "Final destination alert ⚠️", body: "Deadlines wait for no one. {left} to save the day." },
    { title: "Lagaan: 'Dugna lagaan bharna padega' 🌾", body: "Delay kiya toh extra work bharna padega. Hurry!" },
    { title: "Munna Bhai: 'Carrom ramvanu, juice pivanu' 🎲", body: "Lekin pehle deadline wala task khatam karvanu." },
    { title: "Kabir Singh BGM blasting 🏍️", body: "Full aggression mode: Finish this task in {left}." },
  ],

  // Scenario 3: Morning agenda kickoff (8:30 - 9:30 AM)
  MORNING_KICKOFF: [
    { title: "Subah ho gayi Mamu! ☀️", body: "Chai piyo, ALIBI kholo aur aaj ka agenda lock karo." },
    { title: "Wake Up Sid! 🏙️", body: "Aaj ki to-do list khud se chalke nahi aayegi." },
    { title: "Utho Anarkali, meeting bohot hain 💃", body: "Pehle top 3 high-leverage tasks mark karo." },
    { title: "Ashneer: 'Bhai kya kar raha hai?' 🦈", body: "Subah ho gayi. Aaj ka board dekh lo." },
    { title: "Aaj kuch toofani karte hain ⚡", body: "Pehle ALIBI mein mission set karte hain." },
    { title: "Breakfast for champions 🍳", body: "Eat the frog: Pick your hardest task first." },
    { title: "Munna Bhai: 'Tension lene ka nahi' 💊", body: "Priorities set kar lo, din bhar ka tension khatam." },
    { title: "Kaun Banega Crorepati? 💰", body: "Aaj ka pehla sawal: Which task will make you proud today?" },
    { title: "Good morning sunshine 🌻", body: "Or should we say, good morning Chief Executive of Today?" },
    { title: "War room activated ⚔️", body: "Strategy session: Review today's battleground in ALIBI." },
    { title: "Chai garam, tasks naram ☕", body: "Garam chuski ke saath organize your day." },
    { title: "Ek tha Tiger 🐅", body: "Jo subah 9 baje tasks finalize karta tha. Be that tiger." },
    { title: "Wasseypur: 'Subah subah...' 🌅", body: "Dimaag taaza hai, hardest problem pehle crack karo." },
    { title: "Bunny: 'Main rukna nahi chahta' 🏃", body: "Toh morning plan bana ke speed pakad!" },
    { title: "Dil Chahta Hai 🌊", body: "Ki aaj saare tasks green tick ho jaayein. Set them up." },
    { title: "Morning blues? 💙", body: "Turn them into completed green checkmarks in ALIBI." },
    { title: "Zindagi na milegi dobara 🤿", body: "Par aaj ka 24 hours mil gaya. Own every hour." },
    { title: "Aaj ki taaza khabar 📰", body: "A high-performing individual is about to open ALIBI." },
    { title: "Coffee loaded, goals unloaded 🎯", body: "Set your day before random fires set it for you." },
    { title: "Avengers assemble! 🛡️", body: "Assemble today's tasks and conquer the day." },
    { title: "Matrix: Red or Blue pill? 💊", body: "Red pill: Open ALIBI and control your time today." },
    { title: "Mirzapur: 'Niyam same hoga' ⚖️", body: "Subah ka plan, shaam ka chain. Plan now." },
    { title: "Rise and grind (smartly) 🧠", body: "Add today's top 3 tasks and let ALIBI pace you." },
    { title: "Babu Bhaiya: 'Utha le re baba' 📦", body: "Aalas ko utha ke bahar feko, kaam shuru karo." },
    { title: "Goal setting mode: ON 🚀", body: "5 minutes of planning now saves chaos later." },
  ],

  // Scenario 4: Sunset sweep / End of day review (7:00 - 8:30 PM)
  SUNSET_SWEEP: [
    { title: "O Stree kal aana! 👻", body: "Aaj ka kaam khatam. Remaining tasks close karo aur log off!" },
    { title: "Biryani thandi ho rahi hai 🍗", body: "ALIBI band karo, din wrap karo aur dinner enjoy karo." },
    { title: "Khatam! Hazaam! Shanti! 🧘", body: "Aaj kitna achieve kiya? Check your productivity score." },
    { title: "Sholay: 'Yeh haath mujhe de de' 🖐️", body: "Laptop band karo, family aur doston ko time do." },
    { title: "Mirzapur: 'Rest kar lijiye' 🛏️", body: "Varna rest in peace ho jayenge. Wrap up today's work." },
    { title: "Ghar aaja pardesi 🏡", body: "Screen time OFF, real life ON. Sweep your board." },
    { title: "Aaj ka kalyan ho gaya 🪔", body: "Review incomplete items, push to tomorrow, and chill." },
    { title: "Babu bhaiya: 'Chhappar faad ke' 🎁", body: "Dekho aaj kitna hua. Review your day in ALIBI." },
    { title: "Netflix is waiting for you 🍿", body: "Clear your tasks for 100% guilt-free bingeing." },
    { title: "So ja beta varna Gabbar aa jayega 🌙", body: "Close active timers, end your shift peacefully." },
    { title: "Mission accomplished? 🎯", body: "Review your completed vs planned tasks in ALIBI." },
    { title: "Main udna chahta tha, ab sona chahta hoon 😴", body: "Wrap your board and recharge your batteries." },
    { title: "Aap thak gaye honge 🫖", body: "Chai piyo, aaj ka hisaab ALIBI summary mein dekho." },
    { title: "Taare Zameen Par 🌟", body: "Every completed task counts. Check your daily summary." },
    { title: "Dangal: 'Chhoriyan chhoron se kam nahi' 🥇", body: "Aaj ka hisaab dekho, kal ki taiyari karo." },
    { title: "GOT: 'And now my watch is ended' 🏰", body: "Clock out like a warrior who won the day." },
    { title: "Yeh raat bheegi bheegi 🌧️", body: "Time to reflect, close pending tickets, and breathe." },
    { title: "Kuch toh log kahenge... 🎶", body: "Par tumhara proof ALIBI mein verified hai. Goodnight." },
    { title: "Shab-ba-khair dost 🌌", body: "Clean slate ready for tomorrow. Shut down now." },
    { title: "Swiggy order arrived? 🍕", body: "Put away work, cold pizza is a crime." },
    { title: "3 Idiots: 'All is well' 🩺", body: "Review your day, then rest well for tomorrow." },
    { title: "Overtime is a scam 🕶️", body: "Smart workers log off on time. Pack your bags." },
    { title: "Battery at 5% 🔋", body: "Yours and the phone's. Close ALIBI and plug in." },
    { title: "Paisa hi paisa hoga 🤑", body: "Consistent daily execution wins. Close today's board." },
    { title: "Lights out 🕯️", body: "Tap to review your day's score and close the tab." },
  ],

  // Scenario 5: ALIBI has not been opened for 36 hours. The phone can't know whether tasks
  // were tracked elsewhere (web, widget), so no copy claims a count or a number of days.
  GHOSTING: [
    { title: "Hum aapke hain koun? 🥺", body: "Kaafi der se mulaqat nahi hui. Yaad aa rahi hai." },
    { title: "Seen pe chhod diya? 💔", body: "ALIBI app ro raha hai akele. Aao kuch capture karo." },
    { title: "Bhool gaye kya purane din? 🎶", body: "Hamara aur aapka productivity ka sacred pact tha." },
    { title: "Pushpa: 'Flower samjhe kya?' 🌸", body: "Main AI timekeeper hoon! Where are your tasks?" },
    { title: "Itna jo muskura rahe ho... 😏", body: "Kaam chhod ke kya chhipa rahe ho? Open ALIBI." },
    { title: "CID ACP: 'Kuch toh gadbad hai' 🔍", body: "ALIBI itni der se band hai. Suspicious, Daya!" },
    { title: "Mirzapur: 'Darte nahi hain kya?' 🔫", body: "Guddu bhaiya wants to know where your goals went." },
    { title: "Missing person report 🚨", body: "Last seen: a while ago. Come back!" },
    { title: "Tere naam humne kiya hai... 💔", body: "Par aapne app icon ko touch tak nahi kiya." },
    { title: "Shaadi ka khayal dil mein aaya hai? 💒", body: "Isliye kaam-dhandha sab bhool gaye?" },
    { title: "Zomato: 'We miss cravings' 🍔", body: "ALIBI: 'We miss your task checkmarks' ✅" },
    { title: "Hello darkness my old friend 🌑", body: "Your empty dashboard is crying silently." },
    { title: "Aapke bina sab soona soona 🌾", body: "Just 1 quick capture to break the silence." },
    { title: "Bhai tuition gaya hai kya? 🎒", body: "Kaafi der se gayab ho. Jump back in the game." },
    { title: "Dil to pagal hai 💃", body: "Dil deewana hai... par kaam kaun karega bhaiya?" },
    { title: "Karan Arjun aayenge 👬", body: "Par tum kab aaoge ALIBI mein?" },
    { title: "Ek chutki sindoor... 💄", body: "Ek quick task capture ki keemat tum kya jaano user babu?" },
    { title: "Don ko dhoondhna mushkil hai... 🕵️", body: "Par tumko ALIBI open karna sirf 1 tap ka kaam hai!" },
    { title: "Ghost mode: ON 👻", body: "Break the silence with a 30-second capture." },
    { title: "Shark Tank: 'I am out' 🦈", body: "Itna lamba break is not investable. Come back!" },
    { title: "Kya se kya ho gaya bewafa 😢", body: "Come back to your goals before the week ends." },
    { title: "Kaam 25 hai 🎵", body: "Par shuruaat ek se hoti hai. Add one task now." },
    { title: "Akele akele kahan ja rahe ho? 🚶", body: "ALIBI ko bhi pocket mein saath rakho." },
    { title: "Notification bell bajayi hai 🔔", body: "Darwaza kholo aur 1 priority log karo!" },
    { title: "Gone with the wind 🍃", body: "Track 5 minutes today and get back on track." },
  ],
};

/** Default calm/formal copies for users who prefer standard tone */
export const CALM_NOTIFICATION_VAULT: Record<NotificationScenario, WittyCopy> = {
  TIMER_RUNAWAY: {
    title: "Focus check-in",
    body: "A task timer has been running for 2 hours. Take a break or check your progress.",
  },
  DEADLINE_CRUNCH: {
    title: "Due in {left}",
    body: "A task is due soon.",
  },
  MORNING_KICKOFF: {
    title: "Plan your day",
    body: "Review today's agenda and prioritize your key tasks.",
  },
  SUNSET_SWEEP: {
    title: "Evening review",
    body: "Review completed tasks and wrap up your day's summary.",
  },
  GHOSTING: {
    title: "ALIBI check-in",
    body: "Capture your next priority to keep your momentum going.",
  },
};

/** Get the user's notification personality style ('witty' | 'calm'). Defaults to 'witty'. */
export async function getNotificationStyle(): Promise<"witty" | "calm"> {
  try {
    const val = await SecureStore.getItemAsync(NOTIFICATION_STYLE_KEY);
    return val === "calm" ? "calm" : "witty";
  } catch {
    return "witty";
  }
}

/** Set the user's notification personality style. */
export async function setNotificationStyle(style: "witty" | "calm"): Promise<void> {
  try {
    await SecureStore.setItemAsync(NOTIFICATION_STYLE_KEY, style);
  } catch {
    // Non-fatal if secure store fails
  }
}

/**
 * Returns a randomized witty copy (or calm copy) for the specified scenario.
 *
 * A deadline reminder states the real time left (`leadMinutes`, the user's reminder
 * setting) and the due time. Before the logic audit it always said "15 minutes", even for
 * a 30- or 60-minute lead.
 */
export async function getNotificationCopy(
  scenario: NotificationScenario,
  context?: { taskTitle?: string; leadMinutes?: number; dueAt?: number },
): Promise<WittyCopy> {
  const style = await getNotificationStyle();
  if (scenario === "DEADLINE_CRUNCH") {
    const lead = Math.max(0, Math.round(context?.leadMinutes ?? 0));
    const left = formatMinutes(lead);
    const due = context?.dueAt !== undefined ? formatClock(context.dueAt) : "";
    const fact = [context?.taskTitle, due ? `due ${due}` : ""].filter(Boolean).join(" · ");
    if (lead < 1) return { title: "Due now", body: fact || CALM_NOTIFICATION_VAULT.DEADLINE_CRUNCH.body };
    const pick = style === "calm"
      ? CALM_NOTIFICATION_VAULT.DEADLINE_CRUNCH
      : WITTY_NOTIFICATION_VAULT.DEADLINE_CRUNCH[Math.floor(Math.random() * WITTY_NOTIFICATION_VAULT.DEADLINE_CRUNCH.length)];
    const title = pick.title.replace(/\{left\}/g, left);
    if (style === "calm") return { title, body: fact || pick.body };
    const joke = pick.body.replace(/\{left\}/g, left);
    return { title, body: fact ? `${fact} — ${joke}` : joke };
  }
  if (style === "calm") return CALM_NOTIFICATION_VAULT[scenario];
  const list = WITTY_NOTIFICATION_VAULT[scenario];
  return list[Math.floor(Math.random() * list.length)];
}

export const DAILY_CHANNEL_ID = "alibi-daily-digests-v2";
export const CHECKIN_CHANNEL_ID = "task-check-ins-v2";
export const DEADLINE_CHANNEL_ID = "task-deadlines-v2";

export const DAILY_MORNING_KIND = "daily_morning_kickoff";
export const DAILY_EVENING_KIND = "daily_evening_sweep";
export const INACTIVITY_NUDGE_KIND = "inactivity_nudge";

/**
 * Configure top-level Expo notification behavior (alerts, sound, badges).
 */
export function registerNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

/**
 * Request notification permissions from Android / iOS.
 * Prompts user with OS system dialog on Android 13+ (POST_NOTIFICATIONS).
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    let settings = await Notifications.getPermissionsAsync();
    if (settings.status !== "granted") {
      settings = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
    }
    return settings.status === "granted";
  } catch {
    return false;
  }
}

/**
 * Ensures high-importance notification channels are registered on Android.
 * High/Max importance guarantees heads-up popup banner and audible chime.
 */
export async function ensureNotificationChannels(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    // Delete legacy low-importance/silent channels
    await Notifications.deleteNotificationChannelAsync("alibi-daily-digests").catch(() => undefined);
    await Notifications.deleteNotificationChannelAsync("task-check-ins").catch(() => undefined);
    await Notifications.deleteNotificationChannelAsync("task-deadlines").catch(() => undefined);

    await Notifications.setNotificationChannelAsync(DAILY_CHANNEL_ID, {
      name: "Daily Motivation & Check-ins",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#F47B25",
      enableLights: true,
      enableVibrate: true,
      showBadge: true,
    });

    await Notifications.setNotificationChannelAsync(CHECKIN_CHANNEL_ID, {
      name: "Task Check-ins",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#F47B25",
      enableLights: true,
      enableVibrate: true,
      showBadge: true,
    });

    await Notifications.setNotificationChannelAsync(DEADLINE_CHANNEL_ID, {
      name: "Task Deadlines",
      importance: Notifications.AndroidImportance.MAX,
      sound: "default",
      vibrationPattern: [0, 300, 200, 300],
      lightColor: "#EF4444",
      enableLights: true,
      enableVibrate: true,
      showBadge: true,
    });
  } catch {
    // Non-fatal if channel creation fails
  }
}

/**
 * Schedule daily morning kickoff (9:00 AM) and evening sweep (8:00 PM).
 */
export async function scheduleDailyWittyReminders(): Promise<void> {
  try {
    const granted = await requestNotificationPermissions();
    if (!granted) return;

    await ensureNotificationChannels();

    const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
    const existingMorning = scheduled.find((s) => s.content.data?.kind === DAILY_MORNING_KIND);
    const existingEvening = scheduled.find((s) => s.content.data?.kind === DAILY_EVENING_KIND);

    // Schedule 9:00 AM Morning Kickoff if not present
    if (!existingMorning) {
      const copy = await getNotificationCopy("MORNING_KICKOFF");
      await Notifications.scheduleNotificationAsync({
        content: {
          title: copy.title,
          body: copy.body,
          data: { kind: DAILY_MORNING_KIND },
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: 9,
          minute: 0,
          ...(Platform.OS === "android" ? { channelId: DAILY_CHANNEL_ID } : {}),
        },
      });
    }

    // Schedule 8:00 PM (20:00) Sunset Sweep if not present
    if (!existingEvening) {
      const copy = await getNotificationCopy("SUNSET_SWEEP");
      await Notifications.scheduleNotificationAsync({
        content: {
          title: copy.title,
          body: copy.body,
          data: { kind: DAILY_EVENING_KIND },
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: 20,
          minute: 0,
          ...(Platform.OS === "android" ? { channelId: DAILY_CHANNEL_ID } : {}),
        },
      });
    }
  } catch {
    // Non-fatal
  }
}

/** Resets a 36-hour inactivity notification so if the user ghosts the app, they receive a funny nudge */
export async function scheduleInactivityNudge(): Promise<void> {
  try {
    const granted = await requestNotificationPermissions();
    if (!granted) return;

    await ensureNotificationChannels();

    const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
    const ghostNotifs = scheduled.filter((s) => s.content.data?.kind === INACTIVITY_NUDGE_KIND);
    await Promise.all(ghostNotifs.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => undefined)));

    const copy = await getNotificationCopy("GHOSTING");

    await Notifications.scheduleNotificationAsync({
      content: {
        title: copy.title,
        body: copy.body,
        data: { kind: INACTIVITY_NUDGE_KIND },
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 36 * 3600, // 36 hours
        repeats: false,
        ...(Platform.OS === "android" ? { channelId: DAILY_CHANNEL_ID } : {}),
      },
    }).catch(() => undefined);
  } catch {
    // Non-fatal
  }
}

/**
 * Immediately schedules a test witty notification to fire in 2 seconds.
 * Allows user to verify audible sound, heads-up banner, and vibration on device.
 */
export async function triggerTestNotification(): Promise<boolean> {
  try {
    const granted = await requestNotificationPermissions();
    if (!granted) return false;

    await ensureNotificationChannels();
    // The title shows the chosen style; the body never claims a timer is running.
    const copy = await getNotificationCopy("TIMER_RUNAWAY");

    await Notifications.scheduleNotificationAsync({
      content: {
        title: copy.title,
        body: "Test notification. ALIBI's reminders look and sound like this.",
        data: { kind: "test_notification" },
        sound: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 2,
        ...(Platform.OS === "android" ? { channelId: DAILY_CHANNEL_ID } : {}),
      },
    });
    return true;
  } catch (e) {
    console.warn("Failed to trigger test notification:", e);
    return false;
  }
}
