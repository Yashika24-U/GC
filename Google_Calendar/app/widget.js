let attendeesList = [];
let callbackUrl = "";
let pollInterval = null;
let lastEventState = {};

const attendeesInput = document.getElementById("attendeesInput");
const attendeeTagsContainer = document.getElementById("attendeeTagsContainer");

const attendeeError = document.getElementById("attendeeError");
const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;

function createAlert(title, message) {
  SDP.showAlert({
    title,
    message,
    action: "Ok",
  });
}

function getRequestDetails(requestId) {
  SDP.get({ url: `/requests/${requestId}` })
    .then((response) => {
      const request = response.request;
      document.getElementById("eventTitle").value = request.subject;
    })
    .catch((err) => {
      throw err;
    });
}

function getExistingEventId(calendarId, eventTitle) {
  return SDP.invokeUrl({
    url: `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
    method: "get",
    headers: { Accept: "application/json" },
    connectionLinkName: "calendar",
  }).then((response) => {
    const events = response.response?.items || [];
    const event = events.find((ev) => ev.summary === eventTitle);
    return event ? event.id : null;
  });
}

function callback() {
  SDP.get({
    url: "/api/v3/customfunctions",
    input_data: {
      list_info: {
        search_criteria: {
          field: "function_type",
          condition: "EQ",
          value: "callback",
          children: [
            {
              logical_operator: "and",
              field: "api_name",
              condition: "EQ",
              value: "calendar",
            },
          ],
        },
      },
    },
  })
    .then((response) => {
      callbackUrl = response.customfunctions[0]?.callback_url;
      if (callbackUrl) {
      } else {
        throw new Error("No callback URL found in the response.");
      }
    })
    .catch((error) => {
      throw error;
    });
}

function createCalendarEvent(event) {
  event.preventDefault();

  const calendarId = document.getElementById("CalendarSelect").value;
  const eventTitle = document.getElementById("eventTitle").value;
  const startDateTime = new Date(
    document.getElementById("startDateTime").value,
  ).toISOString();
  const endDateTime = new Date(
    document.getElementById("endDateTime").value,
  ).toISOString();

  const attendees = attendeesList.map((email) => ({ email: email.trim() }));

  if (!calendarId || !eventTitle || !startDateTime || !endDateTime) {
    createAlert("Error", "Please complete all fields.");
    return;
  }

  getExistingEventId(calendarId, eventTitle).then((eventId) => {
    const url = eventId
      ? `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`
      : ` https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;

    const method = eventId ? "put" : "post";

    const eventDetails = {
      calendarId,
      summary: eventTitle,
      attendees: attendees,
      end: {
        dateTime: endDateTime,
        timeZone: "Asia/Kolkata",
      },
      start: {
        dateTime: startDateTime,
        timeZone: "Asia/Kolkata",
      },
    };

    SDP.invokeUrl({
      url,
      method,
      headers: { Accept: "application/json" },
      payload: JSON.stringify(eventDetails),
      connectionLinkName: "calendar",
    })
      .then((response) => {
        const eventData = response.response || response;
        if (!eventId) {
          eventId = eventData.id;
          createAlert("Success", "Event created successfully!");
        } else {
          createAlert("Success", "Event updated successfully!");
        }
        const eventLink = eventData.htmlLink;

        setupEventWatch(calendarId);

        SDP.add({
          url: `/requests/${requestId}/notes`,
          input_data: {
            request_note: {
              description: `Event created in Calendar. <a href="${eventLink}" target="_blank">Click here</a> to view.`,
              notify_technician: false,
              show_to_requester: false,
            },
          },
        });
      })
      .catch((error) => {
        createAlert("Error", "An error occurred while creating the event.");
      });
  });
}

function generateUUID() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (
      +c ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))
    ).toString(16),
  );
}

function setupEventWatch(calendarId) {
  const uniqueId = generateUUID();
  SDP.invokeUrl({
    url: `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/watch`,
    method: "post",
    headers: { Accept: "application/json" },
    connectionLinkName: "calendar",
    payload: JSON.stringify({
      id: uniqueId,
      type: "webhook",
      address: callbackUrl,
    }),
  })
    .then((response) => {
      const watchResponse = response.response || response;

      if (watchResponse.resourceUri) {
        // Start polling the resourceUri
        pollResourceUri(watchResponse.resourceUri);
        createAlert("Success", "Event watch request set up successfully.");
      } else {
        throw new Error("No resourceUri found in watch response.");
      }
    })
    .catch((error) => {
      throw error;
      createAlert("Error", "Failed to set up event watch request.");
    });
}

function pollResourceUri(resourceUri) {
  // Clear any existing interval to prevent conflicts
  if (pollInterval) {
    clearInterval(pollInterval);
  }

  // Initialize polling interval
  pollInterval = setInterval(() => {
    SDP.invokeUrl({
      url: resourceUri,
      method: "get",
      headers: { Accept: "application/json" },
      connectionLinkName: "calendar",
    })
      .then((response) => {
        const allEvents = response.response?.items || [];

        const latestEvent = allEvents[allEvents.length - 1];

        if (latestEvent) {
          // Check if fields have changed
          const { summary, description, created, updated } = latestEvent;
          if (lastEventState.updated !== updated) {
            lastEventState = { summary, description, created, updated };
            sendToWebhook(latestEvent);
          } else {
          }
        } else {
          throw new Error("No events found in the polled data.");
        }
      })
      .catch((err) => {
        throw err;
      });
  }, 5000);
}

let lastWebhookSentTime = 0;

function sendToWebhook(data) {
  const now = Date.now();
  if (now - lastWebhookSentTime < 5000) {
    throw new Error("Skipping webhook due to debounce period.");
    return;
  }
  lastWebhookSentTime = now;

  if (!callbackUrl) {
    throw new Error("Callback URL not set. Unable to send data.");
    return;
  }

  SDP.invokeUrl({
    url: callbackUrl,
    method: "post",
    headers: { "Content-Type": "application/json" },
    payload: JSON.stringify(data),
  })
    .then((response) => {})
    .catch((err) => {
      throw err;
    });
}

function fetchCalendarList() {
  SDP.invokeUrl({
    url: "https://www.googleapis.com/calendar/v3/users/me/calendarList",
    method: "get",
    headers: { Accept: "application/json" },
    connectionLinkName: "calendar",
  })
    .then((response) => {
      const data = response.response || response;
      if (data && data.items && data.items.length > 0) {
        populateCalendarDropdown(data.items);
      } else {
        throw new Error("No calendars found or failed to load calendars.");
      }
    })
    .catch((error) => {
      throw error;
    });
}

function populateCalendarDropdown(calendars) {
  const calendarSelect = document.getElementById("CalendarSelect");
  calendarSelect.innerHTML = '<option value="">Select Calendar</option>';
  calendars.forEach((calendar) => {
    const option = document.createElement("option");
    option.value = calendar.id;
    option.textContent = calendar.summary;
    calendarSelect.appendChild(option);
  });
}

attendeesInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && attendeesInput.value.trim()) {
    e.preventDefault();
    const email = attendeesInput.value.trim();

    if (!gmailRegex.test(email)) {
      attendeeError.textContent = "Please enter a valid Gmail address.";
      return;
    }

    attendeeError.textContent = "";

    if (!attendeesList.includes(email)) {
      attendeesList.push(email);
      addAttendeeTag(email);
    }
    attendeesInput.value = "";
  }
});

function addAttendeeTag(email) {
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.innerHTML = `${email} <span class="remove" onclick="removeAttendeeTag('${email}')">&times;</span>`;
  attendeeTagsContainer.appendChild(tag);
}

function removeAttendeeTag(email) {
  attendeesList = attendeesList.filter((att) => att !== email);
  attendeeTagsContainer.innerHTML = "";
  attendeesList.forEach(addAttendeeTag);
}
