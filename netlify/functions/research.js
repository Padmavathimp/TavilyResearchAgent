
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseArticleDate(dateText) {
  if (!dateText) return null;

  const parsedDate = new Date(dateText);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return formatDate(parsedDate);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({
        error: "Method not allowed"
      })
    };
  }

  try {
    const apiKey = process.env.TAVILY_API_KEY;

    if (!apiKey) {
      throw new Error("Tavily API key is missing.");
    }

    const { topic, meetingDate } = JSON.parse(event.body || "{}");

    if (!topic || !meetingDate) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Company name and meeting date are required."
        })
      };
    }

    const company = topic.trim();

    // Calculate the 30-day research period.

    const meeting = new Date(`${meetingDate}T00:00:00`);

    if (Number.isNaN(meeting.getTime())) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Invalid meeting date."
        })
      };
    }

    const endDate = new Date(meeting);
    endDate.setDate(endDate.getDate() - 1);

    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 30);

    const startDateText = formatDate(startDate);
    const endDateText = formatDate(endDate);

    // Search Tavily.

    const query =
      `${company} recent news announcements partnerships ` +
      `AI cloud product launches business updates`;

    const response = await fetch(
      "https://api.tavily.com/search",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          api_key: apiKey,
          query: query,
          topic: "general",
          search_depth: "advanced",
          max_results: 20,
          include_answer: false,
          include_raw_content: true,
          start_date: startDateText,
          end_date: endDateText
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.detail ||
        data.message ||
        "Tavily search failed."
      );
    }

    const results = data.results || [];

    // Filter relevant research results.

    const excludedDomains = [
      "superpowerdaily.com"
    ];

    


    const filteredResults = results

      .map((result) => {
        const title = result.title || "";
        const url = result.url || "";

        const content =
          result.content ||
          result.raw_content ||
          "";

        const searchableText =
          `${title} ${content} ${url}`.toLowerCase();

        const companyName = company.toLowerCase();

        const isCompanyRelevant =
          searchableText.includes(companyName) ||
          url.toLowerCase().includes(
            companyName.replace(/\s+/g, "")
          );

        const hasNewsKeyword =
          newsKeywords.some(keyword =>
            title.toLowerCase().includes(keyword)
          );

        const isExcluded =
          excludedDomains.some(domain =>
            url.toLowerCase().includes(domain)
          ) ||
          url.toLowerCase().includes("finance.yahoo.com") ||
          title.toLowerCase().includes("stock price") ||
          title.toLowerCase().includes("stock quote");

        if (
          !isCompanyRelevant ||
          !hasNewsKeyword ||
          isExcluded
        ) {
          return null;
        }

        // Check Tavily publication date first.
        // If unavailable, check explicitly labelled
        // publication dates in the article content.

        const contentDateMatch = content.match(
          /(?:Press Release|Published|Publication date|Date published)\s*[,:\-]\s*((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+20\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2},?\s+20\d{2})/i
        );

        const publishedDate =
          result.published_date ||
          (contentDateMatch
            ? contentDateMatch[1]
            : "");

        let displayDate = "Date not verified";
        let dateVerified = false;

        if (publishedDate) {
          const parsedPublishedDate =
            parseArticleDate(publishedDate);

          if (
            parsedPublishedDate &&
            parsedPublishedDate >= startDateText &&
            parsedPublishedDate <= endDateText
          ) {
            displayDate = parsedPublishedDate;
            dateVerified = true;
          } else {
            return null;
          }
        }

        return {
          title: title || "Untitled article",
          url: url,
          content: content,
          date: displayDate,
          dateVerified: dateVerified
        };
      })

      .filter(Boolean)

      .slice(0, 8);

    // Prepare recent developments.

    const developments = filteredResults.map(
      (result, index) => {
        return (
          `${index + 1}. ${result.title}\n` +
          `Date: ${result.date}\n` +
          `Details: ${result.content.slice(0, 450)}\n` +
          `Source: ${result.url}`
        );
      }
    );

    // Calculate publication-date statistics.

    const verifiedCount = filteredResults.filter(
      result => result.dateVerified
    ).length;

    const unverifiedCount =
      filteredResults.length - verifiedCount;

    // Prepare executive summary.

    const summary = filteredResults.length > 0
      ? `The research identified ${filteredResults.length} relevant developments concerning ${company} during ${startDateText} to ${endDateText}. Key areas include partnerships, AI and cloud updates, product announcements, and service developments. ${verifiedCount} publication dates were verified from source metadata or explicitly labelled article dates.`
      : `No relevant results with verified publication dates were found for ${company} during ${startDateText} to ${endDateText}.`;

    // Prepare final briefing.

    const briefing = `
MEETING RESEARCH BRIEFING

Company / Person: ${company}

Meeting Date: ${meetingDate}

RESEARCH PERIOD: ${startDateText} to ${endDateText}

EXECUTIVE SUMMARY

${summary}

RECENT DEVELOPMENTS

${developments.length > 0
  ? developments.join("\n\n")
  : "No relevant developments were found."}

RESEARCH STATISTICS

Total relevant results: ${filteredResults.length}

Publication dates verified: ${verifiedCount}

Publication dates not verified: ${unverifiedCount}

IMPORTANT NOTE

Results were retrieved using the selected research period. Entries without verified publication dates are marked "Date not verified" and should be checked against the original source.

END OF BRIEFING
`;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        briefing: briefing
      })
    };

  } catch (error) {
    console.error("Research error:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        error: error.message || "Research failed."
      })
    };
  }
};
