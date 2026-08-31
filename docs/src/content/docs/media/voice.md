---
title: Voice
description: Speaking to a model instead of typing, and having the answer read back.
sidebar:
  order: 2
---

Two separate things, each with its own switch and its own model. Dictation writes into the composer
and stops there. Voice mode runs the whole exchange without your hands, and only on the phone
interface.

Both are extra models, billed like any other, and most connections offer neither. Check
[Providers](/connect/providers/) before expecting them.

## Speaking instead of typing

Switch on _Settings, Voice, Voice input_ and choose a model to transcribe with. Only models marked as
transcription are offered; if the list is empty, mark one in _Models and prices_ on its connection.

A microphone then appears in the composer, on a desktop as much as on a phone. It writes into the
field rather than sending, so what was heard is read before it goes.

## Voice mode

The phone interface gives speaking a screen of its own, and there it is a loop rather than a
microphone button. You speak; it stops listening on its own once the room has been quiet for a
moment; the turn runs; the answer is read back out loud; it listens again. Nothing is tapped between
one question and the next, which is what lets it work with the phone face down on a table. One key
stops whatever is happening, and pressing it while an answer is being read cuts it off and hands you
the floor.

Reading aloud is its own switch, _Settings, Voice, Read answers aloud_, with its own model and a
voice chosen by name. It is off until asked for: it is a second model again, billed like any other,
and on most connections it is not available at all.

How long a silence ends your turn, and whether it listens again once it has answered, are both in
_Settings, Voice_. Neither has a right value in the abstract: somebody who thinks mid-sentence needs
three seconds where somebody dictating a list is cut off by anything over one, and a microphone that
reopens by itself is a reasonable thing to switch off.

The orb is the control. There is no separate key: you press the only object on the screen, and its
colour says whether a conversation is engaged. Muted is a screen waiting to be started, the accent is
a microphone that will open again by itself once the answer finishes. Pressing while it reads takes
the floor back.

It is drawn from the sound itself rather than animated on a timer, the microphone while you talk and
the speaker while it answers, so a room it cannot hear leaves it still. That is the quickest way to
tell a permission problem from a quiet one.

An exchange held by voice is an ordinary conversation. It is saved as it goes and it is in the list
afterwards, every word of it readable, because a voice mode that kept no transcript would be the one
part of the app you could not go back and check.

The sound never touches disk in either direction. A recording exists for the length of one request
to your own transcription model; an answer exists as sound for as long as it is playing, and is
never cached, since a cache of what you were told is a transcript kept by the one part of the app
with no reason to hold one. On a shared instance an administrator can publish the transcription
setup, which is usually the difference between a feature everybody has and one only they have.

It installs as a PWA. On iOS, _Share → Add to Home Screen_; on Android, the install prompt in
Chrome's menu. Installed, it runs without browser chrome and keeps its own theme colour.

:::note[Installed on two devices]
Both talk to the same instance, so both show the same conversations: what is installed is the
interface, not the data. See [Personal or shared](/guides/running-modes/).
:::
