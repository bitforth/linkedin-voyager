import APIClient from './base/APIClient';
import {getPublicIdentifier, extractRootDomain} from './utils.js';

const BASE_URL = 'https://www.linkedin.com/voyager/api';
const LI_CDN = 'https://media-exp2.licdn.com/media';

export default class Voyager extends APIClient {
  constructor(csrfToken) {
    super();
    this.csrfToken = csrfToken;
  }

  /**
   * Fetches the HTML for SalesNav Full Profile and parses it.
   * @param  {String} salesNavProfileURL
   * @return {Promise}
   */
  scrapeSalesNavFullProfile(salesNavProfileURL) {
    const requestOptions = {
      method: 'GET',
      credentials: 'same-origin',
      headers: this._getRequestHeaders(),
      raw: true
    };
    return this._sendRequest(salesNavProfileURL, requestOptions)
    .then(r=> r.text())
    .then(html => Promise.resolve(this._getPublicProfileUrlFromText(html)))
    .then(profileURL=> fetch(profileURL, {credentials: 'same-origin'}))
    .then(res=> res.text())
    .then((body)=> {
      let matches = (body).match(/\/voyager\/api\/identity\/profiles\/(.*)\//);
      return Promise.resolve(matches[1])
    })
    .then((publicIdentifier)=> {
      return this.getFullProfile(publicIdentifier);
    });
  }

  _getPublicProfileUrlFromText(text) {
    let matches = text.match(/\"publicProfileUrl\":\"(.*?)\",/);
    return decodeURIComponent(matches[1]);
  }

  /**
   * Gets the full profile information
   * @param  {String} publicIdentifier LinkedIn public identifier
   * @return {Promise}
   */
  getFullProfile(publicIdentifier) {
    if (!publicIdentifier) {
      throw new Error('a public identifier is required');
    }

    let resources = ['profileView', 'profileContactInfo', 'highlights']
    return Promise.all(resources.map(resource => this._fetchProfileResource(publicIdentifier, resource)))
    .then((responses) => {
      let fullProfile = {publicIdentifier};
      responses.map(res => Object.assign(fullProfile, res));
      return Promise.resolve(this._scrubFullProfileResponse(fullProfile));
    });
  }

  /**
   * Retrieves company information from LinkedIn API.
   * @param  {Integer} companyId LinkedIn's company id
   * @return {Promise}
   */
  getCompany(companyId) {
    const url = `${BASE_URL}/organization/companies?q=universalName&universalName=${companyId}`;
    const requestOptions = {
      method: 'GET',
      credentials: 'same-origin',
      headers: this._getRequestHeaders()
    };

    return this._sendRequest(url, requestOptions)
    .then((res) => {
      return Promise.resolve(this._scrubCompanyResponse(res.elements[0]));
    })
    .catch((err) => {
      return Promise.resolve({});
    });
  }

  /**
   * Scrubs company information from LinkedIn Response.
   * @param  {Object} companyResponse
   * @return {Object}
   */
  _scrubCompanyResponse(companyResponse) {
    const company = {source: 'LinkedIn'};
    company.affiliatedCompanies = companyResponse.affiliatedCompanies || [];

    company.pageUrl = companyResponse.companyPageUrl || '';
    company.domain = extractRootDomain(companyResponse.companyPageUrl);
    company.type = (companyResponse.hasOwnProperty('companyType')) ? companyResponse.companyType.localizedName : '';
    company.confirmedLocations = companyResponse.confirmedLocations || [];
    company.description = companyResponse.description;
    company.linkedInUrn = companyResponse.entityUrn;
    company.name = companyResponse.name;
    company.specialities = companyResponse.specialities || [];
    company.universalName = companyResponse.universalName;
    company.linkedInPageUrl = companyResponse.url || '';

    company.parentCompanyLinkedInId = this._scrubIdFromUrn(companyResponse.parentCompany);
    company.linkedInId = this._scrubIdFromUrn(companyResponse.entityUrn);

    if (companyResponse.hasOwnProperty('foundedOn')) {
      company.foundedOn = companyResponse.foundedOn.year || '';
    }

    if (companyResponse.hasOwnProperty('companyIndustries')) {
      company.industries = companyResponse.companyIndustries.map(c => c.localizedName) || [];
    }

    if (companyResponse.hasOwnProperty('headquarter')) {
      company.city = companyResponse.headquarter.city || '';
      company.country = companyResponse.headquarter.country || '';
      company.geographicArea = companyResponse.headquarter.geographicArea || '';
      company.addr1 = companyResponse.headquarter.line1 || '';
      company.addr2 = companyResponse.headquarter.line2 || '';
      company.postalCode = companyResponse.headquarter.postalCode || '';
    }

    if (companyResponse.hasOwnProperty('followingInfo')) {
      company.linkedInFollowerCount = companyResponse.followingInfo.followerCount || 0;
    }

    if (companyResponse.hasOwnProperty('staffCount')) {
      company.staffCount = companyResponse.staffCount || 0;
    }

    if (companyResponse.hasOwnProperty('logo') && companyResponse.logo.hasOwnProperty('image')) {
      company.logo = this._scrubPathToResource(companyResponse.logo.image) || '';
    }

    if (companyResponse.hasOwnProperty('backgroundCoverImage') && companyResponse.backgroundCoverImage.hasOwnProperty('image')) {
      company.backgroundCoverImage = this._scrubPathToResource(companyResponse.backgroundCoverImage.image) || '';
    }

    if (companyResponse.hasOwnProperty('backgroundCoverPhoto')) {
      company.backgroundCoverPhoto = this._scrubPathToResource(companyResponse.backgroundCoverPhoto) || '';
    }

    return company;
  }

  _getRequestHeaders(headers) {
    let h = new Headers();
    h.append('csrf-token', this.csrfToken);
    if (headers && headers.constructor === Object) {
      Object.keys(headers).forEach((key) => {
        h.append(key, headers[key]);
      });
    }
    return h;
  }

  /**
   * Fetches a resource from the identity/profiles API.
   * @param  {String} publicIdentifier
   * @param  {String} resource
   * @return {Object}
   */
  _fetchProfileResource(publicIdentifier, resource) {
    let url = `${BASE_URL}/identity/profiles/${publicIdentifier}/`;

    if (!resource) {
      url += 'profileView';
    } else {
      url += resource;
    }

    return fetch(url, {
      method: 'GET',
      credentials: 'same-origin',
      headers: this._getRequestHeaders()
    })
    .then((res) => {
      if (!res.ok) {
        throw res;
      }

      return res.json();
    })
    .catch((err)=> {
      console.error(err);
      return Promise.resolve({});
    });
  }

  /**
   * Extracts the id from an urn string.
   * @param  {String} urn urn string
   * @return {Number}
   */
  _scrubIdFromUrn(urn) {
    if (!urn) {
      return '';
    }

    let pieces = urn.split(':');
    return parseInt(pieces[pieces.length - 1], 10);
  }

  /**
   * It returns the path to a logo in a linkedin response.
   * @param  {Object} logo logo object of a linkedin entity.
   * @return {String}
   */
  _scrubPathToResource(resource) {
    if (resource.constructor !== Object) {
      return '';
    }

    let key = Object.keys(resource)[0];
    let resourcePath =  resource[key].id || '';

    if (resourcePath) {
      resourcePath = `${LI_CDN}${resourcePath}`;
    }

    return resourcePath;
  }

  /**
   * Scrubs member object in LinkedIn Response
   * @param  {Object} member member object
   * @return {Object}
   */
  _scrubMemberInfo(member) {
    if (!member) {
      return {firstname: '', lastname: '', occupation: '', publicIdentifier: ''};
    }

    let memberInfo = {
      firstname: (member.member && member.member.firstName) ? member.member.firstName : '',
      lastname: (member.member && member.member.lastName) ? member.member.lastName : '',
      occupation: (member.member && member.member.occupation) ? member.member.occupation : '',
      publicIdentifier: (member.member && member.member.publicIdentifier) ? member.member.publicIdentifier : ''
    };

    if (member.member && member.member.hasOwnProperty('picture')) {
      memberInfo.picture = this._scrubPathToResource(member.member.picture);
    }
    return memberInfo;
  }

  /**
   * Scrubs patent information from LinkedIn Response.
   * @param  {Object} patent
   * @return {Object}
   */
  _scrubPatentInfo(patent) {
    let patentInfo = {
      applicationNumber: patent.applicationNumber || '',
      description: patent.description || '',
      filingDate: patent.filingDate || {},
      issueDate: patent.issueDate || {},
      number: patent.number || '',
      pending: patent.pending,
      title: patent.title || '',
      url: patent.url || ''
    };

    if (patent.hasOwnProperty('inventors') && patent.inventors.length > 0) {
      patentInfo.inventors = patent.inventors
      .filter(inventor => inventor.hasOwnProperty('member'))
      .map(inventor => this._scrubMemberInfo(inventor.member));
    }
    return patentInfo;
  }

  /**
   * Scrubs publication information from LinkedIn response.
   * @param  {Object} publication
   * @return {Object}
   */
  _scrubPublicationInfo(publication) {
    let publicationInfo = {
      date: publication.date || {},
      description: publication.description || '',
      name: publication.name || '',
      publisher: publication.publisher || '',
      url: publication.url || ''
    };

    if (publication.hasOwnProperty('authors') && publication.authors.length > 0) {
      publicationInfo.authors = publication.authors.map(author => this._scrubMemberInfo(author));
    }

    return publicationInfo;
  }

  /**
   * Scrubs project information from LinkedIn response.
   * @param  {Object} project
   * @return {Object}
   */
  _scrubProjectInfo(project) {
    let projectInfo = {
      description: project.description || '',
      timePeriod: project.timePeriod || {},
      title: project.title || '',
      url: project.url || '',
    };

    if (project.hasOwnProperty('members') && project.members.length > 0) {
      project.members = project.members.map(member => this._scrubMemberInfo(member));
    }
    return projectInfo;
  }

  /**
   * Scrubs position information from LinkedIn response.
   * @param  {Object} position
   * @return {Object}
   */
  _scrubPositionInfo(position) {
    let linkedInCompanyId = '';
    if (position.companyUrn) {
      let pieces = position.companyUrn.split(':');
      linkedInCompanyId = parseInt(pieces[pieces.length - 1], 10);
    }

    let positionInfo = {
      locationName: position.locationName || '',
      companyName: position.companyName || '',
      linkedInCompanyId: linkedInCompanyId,
      description: position.description || '',
      timePeriod: position.timePeriod || {},
      title: position.title || '',
    };

    if (position.hasOwnProperty('company')) {
      positionInfo.company = {
        employeeCountRange: position.company.employeeCountRange || {},
        industries: position.company.industries || []
      };

      if (position.company.hasOwnProperty('miniCompany') &&
      position.company.miniCompany.hasOwnProperty('logo')) {
        positionInfo.company.logo = this._scrubPathToResource(position.company.miniCompany.logo);
      }
    }
    return positionInfo;
  }

  /**
   * Scrubs education information from LinkedIn response.
   * @param  {Object} education
   * @return {Object}
   */
  _scrubEducationInfo(education) {
    let educationInfo = {
      activities: education.activities || '',
      degreeName: education.degreeName || '',
      fieldOfStudy: education.fieldOfStudy || '',
      timePeriod: education.timePeriod || {},
      schoolName: education.schoolName || ''
    };

    if (education.hasOwnProperty('school')) {
      educationInfo.school = {
        active: education.school.active || false,
        name: education.school.schoolName || ''
      };

      if (education.school.hasOwnProperty('logo')) {
        educationInfo.school.logo = this._scrubPathToResource(education.school.logo);
      }
    }

    return educationInfo;
  }

  /**
   * Scrubs website info from contactInfo LinkedIn response.
   * @param  {Object} website
   * @return {Object}
   */
  _scrubWebsiteInfo(website) {
    let categoryType = Object.keys(website.type)[0];
    return {
      website: website.url,
      type: website.type[categoryType].category || 'Portfolio'
    };
  }

  /**
   * Takes a response from LinkedIn API. Manipulate its fields, tags the source
   * and returns an object that can be saved in our backend.
   * @param  {Object} profile LinkedIn Profile Information.
   * @return {Object} Object that matches SocialProfile schema.
   */
  _scrubFullProfileResponse(profile) {
    let socialProfile = {source: 'LinkedIn'};
    socialProfile.firstname = profile.profile.firstName || '';
    socialProfile.lastname = profile.profile.lastName || '';
    socialProfile.headline = profile.profile.headline || '';
    socialProfile.industryName = profile.profile.industryName || '';
    socialProfile.summary = profile.profile.summary || '';
    socialProfile.location = profile.profile.locationName || '';
    socialProfile.emailAddress = profile.emailAddress || '';
    socialProfile.publicIdentifier = profile.publicIdentifier;
    socialProfile.occupation = profile.profile.miniProfile.occupation || '';
    socialProfile.address = profile.profile.address || '';
    socialProfile.birthdate = profile.birthDateOn || {};
    socialProfile.phoneNumbers = [];
    socialProfile.twitterHandles = [];
    socialProfile.picture = '';

    if (profile.hasOwnProperty('phoneNumbers')) {
      socialProfile.phoneNumbers = profile.phoneNumbers;
    }

    if (profile.hasOwnProperty('twitterHandles')) {
      socialProfile.twitterHandles = profile.twitterHandles.map(twitter => twitter.name) || [];
    }

    if (profile.profile.hasOwnProperty('pictureInfo') &&
    profile.profile.pictureInfo.hasOwnProperty('masterImage')) {
      socialProfile.picture = `${LI_CDN}${profile.profile.pictureInfo.masterImage}`;
    }

    socialProfile.education = profile.educationView.elements.map(e => this._scrubEducationInfo(e)) || [];
    socialProfile.patents = profile.patentView.elements.map(p => this._scrubPatentInfo(p)) || [];
    socialProfile.publications = profile.publicationView.elements.map(p => this._scrubPublicationInfo(p)) || [];
    socialProfile.projects = profile.projectView.elements.map(p => this._scrubProjectInfo(p)) || [];
    socialProfile.positions = profile.positionView.elements.map(p => this._scrubPositionInfo(p)) || [];
    socialProfile.languages = profile.languageView.elements.map(language => language.name) || [];
    socialProfile.skills = profile.skillView.elements.map(skill => skill.name) || [];

    if (profile.hasOwnProperty('websites') && profile.websites.length > 0) {
      socialProfile.websites = profile.websites.map(w => this._scrubWebsiteInfo(w)) || [];
    }

    // there seems to be a bug with LinkedIns API where headline and occupation
    // are identical. Occupation should be current title at current company.
    if (socialProfile.headline === socialProfile.occupation) {
      let currentPositions = profile.positionView.elements
      .filter(p => p.hasOwnProperty('timePeriod') && p.timePeriod.hasOwnProperty('startDate') && !p.timePeriod.hasOwnProperty('endDate')) || [];
      let currentPosition = currentPositions[0] || {};
      socialProfile.occupation = currentPosition.title || '';
    }

    return socialProfile;
  }
}
