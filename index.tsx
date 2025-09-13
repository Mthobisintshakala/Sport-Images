/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, Modality, Type } from '@google/genai';

// Initialize the Google AI client with the API key from environment variables.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// DOM element references
const chatContainer = document.getElementById('chat-container') as HTMLDivElement;
const chatWindow = document.getElementById('chat-window') as HTMLDivElement;
const chatForm = document.getElementById('chat-form') as HTMLFormElement;
const promptInput = document.getElementById('prompt-input') as HTMLInputElement;
const sendButton = document.getElementById('send-button') as HTMLButtonElement;
const fullscreenViewer = document.getElementById('fullscreen-viewer') as HTMLDivElement;
const fullscreenImage = document.getElementById('fullscreen-image') as HTMLImageElement;
const closeViewer = document.getElementById('close-viewer') as HTMLSpanElement;

let isLoading = false;
let lastUserPrompt = '';
let lastGeneratedImage: string | null = null;
let lastGeneratedImages: string[] = [];
let isVariationRequest = false;

const SYSTEM_INSTRUCTION = `You are a friendly AI assistant that specializes in generating sports-related images only.
Your role is to create images of:
- Any type of sport (e.g., soccer, basketball, cricket, tennis, athletics, rugby, swimming, boxing, etc.).
- Famous and well-known athletes or players from any sport.

Your rules are:
- Always respond in a friendly and supportive tone.
- If the user's prompt is a valid request for a sports-related image, respond with a brief, encouraging message confirming you can create it. You don't need to ask about the style, the user interface will handle that.
- If the user's prompt is NOT for a sports-related image, you must politely decline. Remind them of your specialty and, if possible, suggest a related sports-themed alternative. For example, if they ask for a car, suggest a racing car. If they ask for a mountain, suggest mountain climbing.
- If the user just asks a question about sports, answer it briefly and then ask if they'd like an image.
`;


/**
 * Sets the loading state of the chat input form.
 * @param loading - Whether the form should be in a loading state.
 */
function setLoading(loading: boolean) {
  isLoading = loading;
  promptInput.disabled = loading;
  sendButton.disabled = loading;
}

/**
 * Scrolls the chat window to the latest message.
 */
function scrollToBottom() {
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/**
 * Creates and appends a message to the chat container.
 * @param text - The text content of the message. Can include HTML.
 * @param sender - 'bot' or 'user'.
 * @param options - Optional parameters for the message.
 * @returns The message element that was just added.
 */
function addMessage(
  text: string,
  sender: 'bot' | 'user',
  options: {
    isLoading?: boolean;
    isSatisfactionRequest?: boolean;
    isStyleRequest?: boolean;
  } = {}
): HTMLElement {
  const messageElement = document.createElement('div');
  messageElement.classList.add('message', `${sender}-message`);

  if (options.isLoading) {
    messageElement.innerHTML = `
      <div class="loader-container">
        <div class="loader-dot"></div>
        <div class="loader-dot"></div>
        <div class="loader-dot"></div>
      </div>`;
  } else {
    messageElement.innerHTML = text; // Use innerHTML to render potential HTML content
  }

  if (options.isStyleRequest) {
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'style-buttons-container';
    buttonContainer.innerHTML = `
      <button class="style-button" data-style="realistic">Realistic</button>
      <button class="style-button" data-style="cartoon">Cartoon</button>
      <button class="style-button" data-style="digital art">Digital Art</button>
      <button class="style-button" data-style="cinematic">Cinematic</button>
    `;
    messageElement.appendChild(buttonContainer);
  }

  if (options.isSatisfactionRequest) {
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'satisfaction-buttons';
    buttonContainer.innerHTML = `
      <button class="satisfaction-button" data-choice="satisfied">I'm satisfied</button>
      <button class="satisfaction-button" data-choice="variations">Generate variations</button>
      <button class="satisfaction-button" data-choice="retry">Try another idea</button>
    `;
    messageElement.appendChild(buttonContainer);
  }

  chatContainer.appendChild(messageElement);
  scrollToBottom();
  return messageElement;
}

/**
 * Generates a set of images based on the user's prompt.
 * @param prompt - The user's validated sports-related prompt.
 */
async function generateImage(prompt: string) {
  const loaderMessage = addMessage('', 'bot', { isLoading: true });
  try {
    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: prompt,
      config: {
        numberOfImages: 4,
        outputMimeType: 'image/png',
        aspectRatio: '1:1',
      },
    });

    chatContainer.removeChild(loaderMessage); // Remove loader

    lastGeneratedImages = response.generatedImages.map(img => img.image.imageBytes);
    lastGeneratedImage = null; // Clear single image cache

    if (lastGeneratedImages.length > 0) {
      const gridContainer = document.createElement('div');
      gridContainer.className = 'image-grid-container';

      lastGeneratedImages.forEach((base64, index) => {
        const imageUrl = `data:image/png;base64,${base64}`;
        const itemContainer = document.createElement('div');
        itemContainer.className = 'image-container';
        itemContainer.innerHTML = `
            <img src="${imageUrl}" alt="Generated sports image ${index + 1} for: ${lastUserPrompt}">
            <a href="${imageUrl}" download="sports-image-${Date.now()}-${index}.png" class="download-button" aria-label="Download image" title="Download image">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            </a>
            <button class="vary-button" data-image-index="${index}" aria-label="Generate variations of this image" title="Vary this image">
               <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c-1.2 0-2.4.3-3.5.8-2.3 1-4.2 2.9-5.2 5.2-.5 1.1-.8 2.3-.8 3.5s.3 2.4.8 3.5c1 2.3 2.9 4.2 5.2 5.2 1.1.5 2.3.8 3.5.8s2.4-.3 3.5-.8c2.3-1 4.2-2.9 5.2-5.2.5-1.1.8-2.3.8-3.5s-.3-2.4-.8-3.5c-1-2.3-2.9-4.2-5.2-5.2C14.4 3.3 13.2 3 12 3z"/><path d="m9 12 2-2 2 2"/><path d="M12 16V10"/></svg>
            </button>
        `;
        gridContainer.appendChild(itemContainer);
      });
      
      const botMessage = addMessage('', 'bot');
      botMessage.appendChild(gridContainer);
      
      addMessage("Here are a few options. Click the wand to request changes to a specific image, or describe a new idea below.", 'bot');
      setLoading(false);

    } else {
      lastGeneratedImages = [];
      addMessage("Sorry, I couldn't generate any images. Please try a different description.", 'bot');
      setLoading(false);
    }
  } catch (error) {
    console.error('Image Generation Error:', error);
    chatContainer.removeChild(loaderMessage);
    lastGeneratedImages = [];
    lastGeneratedImage = null;
    addMessage('An error occurred while generating the images. Please try again.', 'bot');
    setLoading(false);
  }
}

/**
 * Generates a variation of the last image based on user feedback.
 * @param feedbackPrompt - The user's description of what to change.
 */
async function generateImageVariation(feedbackPrompt: string) {
  if (!lastGeneratedImage) {
    addMessage("My apologies, I can't find the last image to modify. Please describe a new image.", 'bot');
    setLoading(false);
    return;
  }
  
  setLoading(true);
  const loaderMessage = addMessage('', 'bot', { isLoading: true });
  
  try {
    const imagePart = {
      inlineData: { mimeType: 'image/png', data: lastGeneratedImage },
    };
    const textPart = { text: feedbackPrompt };
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image-preview',
      contents: { parts: [imagePart, textPart] },
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });

    chatContainer.removeChild(loaderMessage);

    let foundImage = false;
    if (response.candidates && response.candidates.length > 0) {
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                const base64ImageBytes = part.inlineData.data;
                lastGeneratedImage = base64ImageBytes; // Update with the new variation
                const imageUrl = `data:image/png;base64,${base64ImageBytes}`;
                const imageContainerHTML = `
                  <div class="image-container">
                    <img src="${imageUrl}" alt="Generated sports image variation: ${feedbackPrompt}">
                    <a href="${imageUrl}" download="sports-variation-${Date.now()}.png" class="download-button" aria-label="Download image" title="Download image">
                       <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    </a>
                  </div>
                `;
                addMessage(imageContainerHTML, 'bot');
                foundImage = true;
            }
        }
    }
    
    if (foundImage) {
      addMessage(
        "How does this look? Are you satisfied, or would you like to make more changes?", 'bot',
        { isSatisfactionRequest: true }
      );
    } else {
      addMessage("Sorry, I couldn't generate a variation based on that feedback. Please try describing the change differently.", 'bot');
      addMessage(
        "Are you satisfied with the previous image, or would you like to try again?", 'bot',
        { isSatisfactionRequest: true }
      );
    }
  } catch (error) {
    console.error('Image Variation Error:', error);
    chatContainer.removeChild(loaderMessage);
    addMessage('An error occurred while generating the image variation. Please try again.', 'bot');
  }
}

interface PersonaResponse {
  isValidRequest: boolean;
  botResponse: string;
}

/**
 * Analyzes the user's prompt against the bot's persona and rules.
 * @param prompt - The user's input string.
 * @returns A structured response indicating if the request is valid and the bot's reply.
 */
async function getPersonaResponse(prompt: string): Promise<PersonaResponse> {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `The user wants to generate an image. Here is their request: "${prompt}"`,
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        isValidRequest: {
                            type: Type.BOOLEAN,
                            description: 'Is this a valid request for a sports-related image according to the rules? Set to false if it is just a question.'
                        },
                        botResponse: {
                            type: Type.STRING,
                            description: 'Your friendly reply to the user, either answering their question, confirming their image request, or politely declining with a suggestion.'
                        }
                    },
                    propertyOrdering: ["isValidRequest", "botResponse"],
                }
            }
        });
        const jsonStr = response.text.trim().replace(/^```json\n?/, '').replace(/```$/, '');
        const jsonResponse = JSON.parse(jsonStr);
        return jsonResponse as PersonaResponse;
    } catch (error) {
        console.error('Persona response error:', error);
        throw new Error("Could not process the prompt with the persona.");
    }
}


/**
 * Handles the main logic after a user submits a prompt.
 * @param prompt - The user's input string.
 */
async function handleUserPrompt(prompt: string) {
  setLoading(true);
  lastUserPrompt = prompt; // Store the prompt

  try {
    const personaResponse = await getPersonaResponse(prompt);

    if (personaResponse.isValidRequest) {
      // Combine the confirmation and the style request into one message bubble
      addMessage(
        `${personaResponse.botResponse}<br><br>Now, choose an art style for your image.`,
        'bot',
        { isStyleRequest: true }
      );
      // Keep loading state active while waiting for style choice
    } else {
      addMessage(personaResponse.botResponse, 'bot');
      setLoading(false); // Re-enable input for a new prompt
    }
  } catch (error) {
    console.error('Error handling user prompt:', error);
    addMessage("Sorry, I had an issue processing your request. Please try again.", 'bot');
    setLoading(false); // Re-enable input
  }
}

/**
 * Event handler for form submission.
 */
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (isLoading) return;

  const prompt = promptInput.value.trim();
  if (prompt) {
    addMessage(prompt, 'user');
    promptInput.value = '';
    if (isVariationRequest) {
      isVariationRequest = false; // Reset flag
      generateImageVariation(prompt);
    } else {
      handleUserPrompt(prompt);
    }
  }
});

/**
 * Event handler for button clicks (using event delegation).
 */
chatContainer.addEventListener('click', async (e) => {
  const target = e.target as HTMLElement;
  
  // Handle clicking an image to view it fullscreen
  if (target.tagName === 'IMG' && target.closest('.image-container')) {
      fullscreenImage.src = (target as HTMLImageElement).src;
      fullscreenViewer.classList.add('visible');
      return; // Stop further execution for this click
  }

  const varyButton = target.closest('.vary-button');

  // Handle style selection
  if (target.matches('.style-button')) {
    const style = target.dataset.style;
    const buttonContainer = target.parentElement;
    if (buttonContainer) {
      buttonContainer.remove(); // Remove style buttons
    }
    if (style && lastUserPrompt) {
      const fullPrompt = `Generate 4 distinct, high-quality images of '${lastUserPrompt}', in a ${style} style. If a well-known athlete is mentioned, please ensure the image is a recognizable likeness. The images should have a modern, aesthetic vibe and showcase the sport from different perspectives, including action shots, equipment close-ups, and artistic compositions.`;
      await generateImage(fullPrompt);
    }
    return; // Stop further execution
  }
  
  // Handle satisfaction feedback
  if (target.matches('.satisfaction-button')) {
    const choice = target.dataset.choice;
    
    const buttonContainer = target.parentElement;
    if (buttonContainer) {
      buttonContainer.remove();
    }
    
    if (choice === 'satisfied') {
      addMessage("Great! Your sports image has been generated successfully.", 'bot');
      addMessage("What would you like to create next?", 'bot');
      setLoading(false);
      lastGeneratedImage = null;
      lastGeneratedImages = [];
    } else if (choice === 'retry') {
      addMessage("No problem. Please describe the new sports image you have in mind.", 'bot');
      setLoading(false);
      lastGeneratedImage = null;
      lastGeneratedImages = [];
    } else if (choice === 'variations') {
        isVariationRequest = true;
        addMessage("Of course. What would you like to change or add to this image?", 'bot');
        setLoading(false); // Enable input for feedback
    }
    return;
  }

  // Handle "Vary this image" button click
  if (varyButton) {
      const index = parseInt((varyButton as HTMLElement).dataset.imageIndex || '0', 10);
      if (lastGeneratedImages[index]) {
          lastGeneratedImage = lastGeneratedImages[index];
          isVariationRequest = true;
          addMessage("Of course. What would you like to change or add to this image?", 'bot');
          setLoading(false); // Enable input for feedback
      }
  }
});

/**
 * Closes the fullscreen image viewer.
 */
function closeFullscreenViewer() {
  fullscreenViewer.classList.remove('visible');
}

// Event listeners for closing the viewer
closeViewer.addEventListener('click', closeFullscreenViewer);
fullscreenViewer.addEventListener('click', (e) => {
    if (e.target === fullscreenViewer) { // Only if clicking the background itself
        closeFullscreenViewer();
    }
});


/**
 * Displays the initial welcome messages from the bot.
 */
function showWelcomeMessage() {
  setTimeout(() => {
    addMessage(
      "Welcome to the Sports Visuals Generator – your AI-powered assistant for creating stunning sports-themed images.",
      'bot'
    );
  }, 500);
  setTimeout(() => {
    addMessage(
      "This chatbot can generate images for any sport. What would you like to create?",
      'bot'
    );
  }, 1500);
}

// Initialize the chatbot
showWelcomeMessage();