// CONTACT state: stillness as the closing note. The scene draws the name;
// the DOM offers exactly an email and a few links.

export function createContactState({ content }) {
  const blurbEl = document.getElementById('contact-blurb');
  const emailEl = document.getElementById('contact-email');
  const linksEl = document.getElementById('contact-links');

  blurbEl.textContent = content.contact.blurb;
  if (content.contact.email) {
    emailEl.textContent = content.contact.email;
    emailEl.href = `mailto:${content.contact.email}`;
  } else {
    emailEl.hidden = true;
  }
  linksEl.innerHTML = '';
  content.contact.links.forEach((l) => {
    const a = document.createElement('a');
    a.href = l.url;
    a.textContent = l.label;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    linksEl.appendChild(a);
  });

  return {
    name: 'contact',
    index: 3,
    label: 'CONTACT',
    enter() {},
    exit() {},
    update() {},
  };
}
